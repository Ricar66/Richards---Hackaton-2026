"use client";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { connectLive, type LiveConnState } from "@/lib/live-client";
import type { LiveEventType } from "@/modules/realtime/domain/live-event";
import type { StageSnapshot } from "@/modules/analytics/application/get-stage-snapshot";
import {
  RULE_STALE_MS, STRIP_WINDOW_MS, alarmMode, twinSimulated, clockBR, fixedBR, hourMinBR, kgNumBR, originSeal, pickFocus, pipeTone, ringView, scaleLotKey, scaleView, secondsSince, sensorSeal,
  settleRefresh, temperatureView, tripView, type RefreshGate, type StripPoint,
} from "./stage-logic";
import { Digits } from "./digits";
import { activeOccurrences, flowOccurrenceFor, focusSource, initModel, lastReadingByDevice, latestLive, packets, reduceStage, serverNow } from "./stage-model";
import { useIdleCursor, useReducedMotion, useStageKeys, useTwinFlag } from "./hooks";
import { CounterSeal, GlobalSeal, Seal, SourceSeal } from "./seal";
import { FlowStrip } from "./flow-strip";
import { TwinSlot } from "./twin-slot";
import { RuleRing } from "./rule-ring";
import { ScalePanel, TemperaturePanel } from "./sensors";
import { EventFeed } from "./event-feed";
import { PacketTrip } from "./packet-trip";

/** Eventos que mudam agregados ou listas do servidor: a tela refaz o snapshot (nunca soma no navegador). */
const REFRESH_ON = new Set<LiveEventType>(["occurrence.opened", "occurrence.status", "donation.created", "donation.status", "resync"]);
const CONN_LABEL: Record<LiveConnState, string> = { connecting: "Conectando", live: "Ao vivo", reconnecting: "Reconectando", down: "Sem stream" };
const SEVERITY: Record<string, string> = { LOW: "baixa", MEDIUM: "média", HIGH: "alta", CRITICAL: "crítica" };
const STATUS: Record<string, string> = { OPEN: "aberta", ACKNOWLEDGED: "assumida" };

type Props = {
  initial: StageSnapshot | null; initialError: "not-seeded" | "database" | null; pinnedCode: string | null;
  /** `?3d=1` liga e `?3d=0` desliga; null respeita a escolha gravada e, sem ela, tenta 3D com fallback. */
  initial3d?: boolean | null;
  /** `?atalhos=0` desliga os atalhos de uma tecla (F, P, 3, D): WCAG 2.1.4. */
  shortcuts?: boolean;
};

/**
 * Sala ao vivo: tela de palco (só para ver). Snapshot do servidor + stream SSE; com o stream fora, consulta o snapshot
 * a cada 5 s e diz isso na tela. Nenhum número nasce aqui: tudo vem do banco, da regra ou do canal ao vivo, com a origem.
 */
export function LiveStage({ initial, initialError, pinnedCode, initial3d = null, shortcuts = true }: Props) {
  const [model, dispatch] = useReducer(reduceStage, initial, initModel);
  const [conn, setConn] = useState<LiveConnState>("connecting");
  const [lostAt, setLostAt] = useState<number | null>(null);
  const [snapError, setSnapError] = useState<string | null>(initialError === "not-seeded" ? "Base não preparada: execute pnpm db:seed." : initialError ? "Banco de dados indisponível." : null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  // Região viva sempre montada: anuncia a pausa e a retomada (uma região inserida já com texto costuma não ser lida).
  const [pauseMsg, setPauseMsg] = useState("");
  const [diag, setDiag] = useState(false);
  const [want3d, toggle3d] = useTwinFlag(initial3d);
  const reduced = useReducedMotion();
  const idle = useIdleCursor(3000);
  const togglePause = () => {
    const next = !paused;
    setPaused(next);
    setPauseMsg(next ? "Movimento pausado. Números, feed e relógio seguem atualizando. Use Retomar movimento para continuar." : "Movimento retomado.");
  };
  useStageKeys({ onPause: togglePause, onToggle3d: toggle3d, onDiag: () => setDiag(d => !d) }, shortcuts);
  // Movimento parado (reduzir movimento do sistema ou tecla P): só o desenho para; o dado continua chegando.
  const still = reduced || paused;

  // Snapshot: só a resposta mais nova é aplicada (duas consultas cruzadas não voltam o estado no tempo), e a falha
  // de uma consulta antiga não põe a faixa de erro sobre o sucesso de uma mais nova (mesma guarda, em settleRefresh).
  const seq = useRef(0);
  const gate = useRef<RefreshGate>({ applied: 0, failed: 0 });
  const refresh = useCallback(async () => {
    const id = ++seq.current;
    const requestedAt = Date.now();
    try {
      const res = await fetch("/api/live/snapshot", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string; code?: string } | null;
        // A Sala diz a causa pelo código; o que acontece com os números ela mesma explica (snapshot congelado ou nenhum).
        throw new Error(body?.code === "DATABASE_UNAVAILABLE" ? "Banco de dados indisponível" : body?.error ?? `HTTP ${res.status}`);
      }
      const snapshot = await res.json() as StageSnapshot;
      const v = settleRefresh(gate.current, id, true);
      gate.current = v.gate;
      if (v.apply) dispatch({ type: "snapshot", snapshot, requestedAt, receivedAt: Date.now() });
      if (v.error === "clear") setSnapError(null);
    } catch (e) {
      const v = settleRefresh(gate.current, id, false);
      gate.current = v.gate;
      if (v.error === "set") setSnapError(e instanceof Error ? e.message : "Falha ao consultar o servidor.");
    }
  }, []);
  const debounce = useRef<number | undefined>(undefined);
  const scheduleRefresh = useCallback(() => {
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => void refresh(), 250);
  }, [refresh]);

  useEffect(() => {
    let wasLive = false;
    const stop = connectLive({
      pauseWhenHidden: false,
      onState: s => {
        setConn(s);
        if (s === "live") { wasLive = true; setLostAt(null); }
        else if (wasLive) { const t = Date.now(); setLostAt(prev => prev ?? t); }
      },
      // Cada hello (inclusive reconexão) cobre o que se perdeu: novo snapshot e novo ajuste de relógio.
      onHello: h => { dispatch({ type: "hello", serverTime: h.serverTime, arrivalMs: Date.now() }); void refresh(); },
      onEvent: e => { dispatch({ type: "event", event: e, arrivalMs: Date.now() }); if (REFRESH_ON.has(e.type)) scheduleRefresh(); },
    });
    return () => { stop(); window.clearTimeout(debounce.current); };
  }, [refresh, scheduleRefresh]);

  // Tique de 1 s: relógio, idades ("há N s") e detecção de dispositivo calado.
  useEffect(() => {
    const tick = () => dispatch({ type: "tick", arrivalMs: Date.now() });
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, []);

  // Com stream: snapshot de segurança a cada 30 s. Sem stream: consulta a cada 5 s (e já na largada).
  useEffect(() => {
    const live = conn === "live";
    const first = live ? undefined : window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), live ? 30_000 : 5_000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [conn, refresh]);

  const now = serverNow(model);
  const refNow = now ?? model.anchorMs ?? 0;
  const snap = model.snapshot;
  const devices = useMemo(() => snap?.devices ?? [], [snap]);
  const nextFocus = pickFocus(devices, lastReadingByDevice(model), { pinnedCode, currentId: focusId, nowMs: refNow });
  if (nextFocus !== focusId) setFocusId(nextFocus);
  const focus = devices.find(d => d.id === nextFocus) ?? null;

  const focusReadings = useMemo(() => (focus ? model.readings[focus.id] ?? [] : []), [focus, model.readings]);
  const points = useMemo<StripPoint[]>(() => focusReadings.map(r => ({ t: Date.parse(r.capturedAt), v: r.flowLpm, source: r.source })), [focusReadings]);
  const lastReading = focusReadings.length ? focusReadings[focusReadings.length - 1] : null;
  const lastAt = lastReading ? Date.parse(lastReading.capturedAt) : null;
  const fresh = lastAt !== null && refNow - lastAt <= RULE_STALE_MS;
  const rule = focus ? model.rules[focus.id] ?? null : null;
  const active = activeOccurrences(model);
  // Regra 5 por origem: o anel e o cano olham a ocorrência da MESMA origem da leitura em foco.
  const flowOcc = focus ? flowOccurrenceFor(model, focus.id, active, focusSource(rule, lastReading)) : null;
  const ring = ringView({ rule, broken: focus ? model.broken[focus.id] ?? null : null, occurrence: flowOcc, nowMs: refNow, minFlowLpm: focus?.minFlowLpm ?? 1.5, continuousSeconds: focus?.continuousSeconds ?? 30 });
  const counting = ring.state === "CONTANDO" || ring.state === "BLOQUEADO_REGRA_5";
  const run = counting && rule && ring.observed > 0 ? { from: rule.at - rule.observedSeconds * 1000, to: rule.at } : null;
  const flowSeal = lastReading ? sensorSeal("flow", lastReading.source, rule && rule.sequence === lastReading.sequence ? rule.channel : undefined) : null;
  // Status da ocorrência de fluxo do sensor em foco (OPEN pisca, ACKNOWLEDGED fixo). Sem snapshot ainda = acabou de abrir.
  const flowOccStatus = flowOcc ? active.find(o => o.id === flowOcc.id)?.status ?? null : null;
  const alarm = alarmMode(ring.state, flowOccStatus, ring.foreign);
  // Carimbo do gêmeo: leitura em foco simulada OU alarme aceso por ocorrência simulada (alarme simulado nunca parece real).
  const flowSim = twinSimulated(flowSeal?.simulated ?? false, alarm, flowOcc?.source);
  // Pulso do gêmeo: muda a cada leitura GRAVADA do sensor em foco (chave bootId:sequence). Vem das leituras do modelo, que o
  // sensor.live (temperatura/peso, mesma mensagem da bancada e do MQTT) não sobrescreve; o "último pacote" sobrescrevia.
  const pulseKey = lastReading ? `${lastReading.bootId}:${lastReading.sequence}` : null;
  // A legenda do pulso só aparece quando ele pode disparar: sem movimento ou sem stream, a falta de pulso não diz nada.
  const pulseOn = !still && conn === "live";

  const temp = latestLive(model.temperature, nextFocus);
  const tempView = temp ? temperatureView(temp, refNow) : null;
  const tempOcc = temp ? active.find(o => o.kind === "TEMPERATURE_EXCURSION" && o.deviceId === temp.deviceId && o.source === temp.source) ?? null : null;
  const scale = latestLive(model.scale, nextFocus);
  const scaleV = scale ? scaleView(scale, model.scaleLots[scaleLotKey(scale.deviceCode, scale.source)] ?? null, refNow) : null;

  const seal = originSeal(packets(model), refNow);
  const trip = model.trip ? tripView(model.trip, model.offsetMs, model.offsetKnown) : null;
  const lost = conn === "reconnecting" || conn === "down";
  const lostFor = lostAt !== null && model.clientNow !== null ? secondsSince(lostAt, model.clientNow) : null;
  const unit = snap ? [snap.organization.name, snap.organization.city].filter(Boolean).join(" · ") : "—";

  return <main className="stage" data-stage="" data-live-state={conn} data-signal={lost ? "lost" : "ok"} data-idle={idle ? "" : undefined} data-reduced={reduced ? "" : undefined} data-paused={paused ? "" : undefined}>
    <header className="stage-head">
      <div className="brand-stage">
        <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3 29 28H3Z" fill="none" stroke="#3fd0a7" strokeWidth="2.6" strokeLinejoin="round" /><path d="M16 13 22 24H10Z" fill="#3fd0a7" opacity=".85" /></svg>
        <b>RICHARDS</b><span>Sala ao vivo</span>
      </div>
      <span className="unit">{unit}</span>
      {paused && <span className="paused-pill" aria-hidden="true">MOVIMENTO PAUSADO · números seguem atualizando</span>}
      <span className="sr-only" role="status">{pauseMsg}</span>
      <time className="clock num" aria-label="Hora de São Paulo">{now !== null ? clockBR(now) : "--:--:--"}</time>
      <span className={`conn ${conn}`} role="status"><i key={model.pulse} className={model.pulse ? "beat" : ""} aria-hidden="true" />{CONN_LABEL[conn]}{conn === "down" ? " · consulta a cada 5 s" : ""}</span>
      <GlobalSeal seal={seal} />
    </header>

    {(lost || snapError) && <div className="stg-alerts">
      {lost && <div className="lost-banner" role="alert">
        <strong>{lostFor !== null ? <>SINAL PERDIDO há <span className="num">{lostFor}</span> s</> : "SEM STREAM AO VIVO"}</strong>
        <small>{conn === "down" ? "consultando o servidor a cada 5 s · nada é desenhado sem dado" : "reconectando · nada é desenhado sem dado"}</small>
      </div>}
      {snapError && <div className="snap-error" role="alert">{snapError}{snap ? ` · números congelados no snapshot das ${clockBR(Date.parse(snap.serverTime))}` : " · nenhum número é exibido para não apresentar dado falso"}</div>}
    </div>}

    <div className="instruments">
      <section className="inst flow" aria-labelledby="stg-flow-title">
        <header className="inst-head">
          <h2 id="stg-flow-title">Vazão</h2>
          {focus && <span className="inst-code">{focus.code}</span>}
          {focus && <span className="inst-label">{focus.label}</span>}
          {flowSeal && <Seal label={flowSeal.label} simulated={flowSeal.simulated} />}
        </header>
        <div className="flow-top">
          <div className={`flow-number${fresh ? "" : " stale"}`}>
            <b className="num huge"><Digits text={lastReading ? fixedBR(lastReading.flowLpm, 2) : "—"} /></b>
            <span className="unit-lpm">L/min</span>
            <p className="flow-meta">
              {!lastReading ? "aguardando leitura" : now === null ? " "
                : <>leitura das <span className="mono">{clockBR(lastAt!)}</span>{secondsSince(lastAt!, now) > 2 ? ` · há ${secondsSince(lastAt!, now)} s` : ""}{lastReading ? <> · seq <span className="mono">{lastReading.sequence}</span></> : null}</>}
            </p>
            <p className="flow-note">observado ≠ economizado · suspeita ≠ vazamento comprovado</p>
          </div>
          <figure className="twin" data-alarm={alarm ?? undefined} data-sim={flowSim ? "" : undefined}>
            <TwinSlot flowLpm={fresh && lastReading ? lastReading.flowLpm : null} tone={pipeTone(ring.state, ring.foreign)} simulated={flowSim} live={fresh}
              pulseKey={pulseKey} still={still} reduced={reduced} want3d={want3d} diag={diag} sourceLabel={flowSeal?.label} deviceCode={focus?.code} />
            <span className="twin-note">representação esquemática{pulseOn ? " · pulso no medidor = leitura gravada" : paused ? " · movimento pausado (P)" : ""}</span>
            <figcaption>
              {focus && <span className="twin-tag"><span className="mono">{lastReading && fresh ? `${fixedBR(lastReading.flowLpm, 2)} L/min` : "sem leitura recente"}</span>{flowSeal && <Seal label={flowSeal.label} simulated={flowSeal.simulated} small />}</span>}
            </figcaption>
          </figure>
        </div>
        <FlowStrip points={points} minFlowLpm={focus?.minFlowLpm ?? 1.5} anchorMs={model.anchorMs} offsetMs={model.offsetMs} nowMs={now} run={run} lost={lost} reduced={still} />
        <p className="strip-legend"><i className="lg solid" /> sensor <i className="lg dash" /> simulado <i className="lg thr" /> limiar de {fixedBR(focus?.minFlowLpm ?? 1.5, 1)} L/min do dispositivo · janela de {STRIP_WINDOW_MS / 1000} s · sem amostra = sem linha</p>
      </section>

      <RuleRing view={ring} deviceCode={focus?.code ?? null} alarm={alarm} />

      <TemperaturePanel t={temp} view={tempView} occurrence={tempOcc} nowMs={now} want3d={want3d} reduced={reduced} diag={diag} />
      <ScalePanel s={scale} view={scaleV} nowMs={now} want3d={want3d} reduced={reduced} diag={diag} />

      <section className="inst today" aria-labelledby="stg-today-title">
        <header className="inst-head"><h2 id="stg-today-title">Hoje</h2>{snap && <span className="inst-code">desde 00:00</span>}</header>
        {!snap ? <p className="waiting">sem dados do servidor</p> : <>
          <div className="count"><b className="num"><Digits text={kgNumBR(snap.today.deliveredKg.value)} /><small> kg</small></b><span>entregues hoje (recebimento) <CounterSeal provenance={snap.today.deliveredKg.provenance} /></span></div>
          <div className="count"><b className="num"><Digits text={String(snap.today.pendingReview.value)} /></b><span>{snap.today.pendingReview.value === 1 ? "lote aguardando" : "lotes aguardando"} verificação humana <CounterSeal provenance={snap.today.pendingReview.provenance} /></span></div>
          <div className="count"><b className="num"><Digits text={String(snap.today.activeOccurrences.value)} /></b><span>{snap.today.activeOccurrences.value === 1 ? "ocorrência ativa" : "ocorrências ativas"} <CounterSeal provenance={snap.today.activeOccurrences.provenance} /></span></div>
          {active[0] && <p className={`occ-latest ${active[0].status === "OPEN" ? "open" : "ack"}`}>
            {/* Origem da ocorrência em destaque: com o contador MISTO, só o selo dela diz se ela é simulada. */}
            <strong><SourceSeal source={active[0].source} />{active[0].title}</strong>
            <span>{STATUS[active[0].status] ?? active[0].status} · {SEVERITY[active[0].severity] ?? active[0].severity} · desde <span className="mono">{hourMinBR(Date.parse(active[0].openedAt))}</span>{active.length > 1 ? ` · +${active.length - 1}` : ""}</span>
          </p>}
        </>}
      </section>

      <EventFeed lines={model.feed} readingCount={model.readingCount} lastReadingAt={model.lastReadingAt} nowMs={now} pulse={model.pulse} still={still} />

      <PacketTrip trip={model.trip} view={trip} reduced={still} />
    </div>
    <footer className="stage-controls" aria-label="Controles da visualização">
      <span className="stage-control-caption">{reduced ? "Movimento reduzido pelo sistema · SVG 2D" : "Visualização esquemática · movimento acompanha as leituras"}</span>
      <button type="button" aria-pressed={paused} onClick={togglePause}>{paused ? "Retomar movimento" : "Pausar movimento"}</button>
      <button type="button" aria-pressed={want3d} disabled={reduced} onClick={toggle3d} title={reduced ? "O sistema solicita movimento reduzido; o SVG 2D permanece ativo." : "Solicitar 3D; o modo efetivo aparece junto ao desenho."}>{want3d ? "Usar SVG 2D" : "Solicitar 3D"}</button>
      <button type="button" aria-pressed={diag} onClick={() => setDiag(d => !d)}>Diagnóstico</button>
      {shortcuts && <span className="stage-control-shortcuts">F tela cheia · P pausa · 3 alterna · D diagnóstico</span>}
    </footer>
  </main>;
}
