"use client";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { connectLive, type LiveConnState } from "@/lib/live-client";
import type { LiveEventType } from "@/modules/realtime/domain/live-event";
import type { StageSnapshot } from "@/modules/analytics/application/get-stage-snapshot";
import {
  RULE_STALE_MS, STRIP_WINDOW_MS, clockBR, fixedBR, hourMinBR, kgNumBR, originSeal, pickFocus, pipeTone, ringView, scaleView, secondsSince, sensorSeal,
  settleRefresh, temperatureView, tripView, type RefreshGate, type StripPoint,
} from "./stage-logic";
import { activeOccurrences, flowOccurrenceFor, initModel, lastReadingByDevice, latestLive, packets, reduceStage, serverNow } from "./stage-model";
import { useIdleCursor, useReducedMotion, useStageKeys } from "./hooks";
import { CounterSeal, GlobalSeal, Seal, SourceSeal } from "./seal";
import { FlowStrip } from "./flow-strip";
import { PipeTwin } from "./pipe-twin";
import { RuleRing } from "./rule-ring";
import { ScalePanel, TemperaturePanel } from "./sensors";
import { EventFeed } from "./event-feed";
import { PacketTrip } from "./packet-trip";

/** Eventos que mudam agregados ou listas do servidor: a tela refaz o snapshot (nunca soma no navegador). */
const REFRESH_ON = new Set<LiveEventType>(["occurrence.opened", "occurrence.status", "donation.created", "donation.status", "resync"]);
const CONN_LABEL: Record<LiveConnState, string> = { connecting: "Conectando", live: "Ao vivo", reconnecting: "Reconectando", down: "Sem stream" };
const SEVERITY: Record<string, string> = { LOW: "baixa", MEDIUM: "média", HIGH: "alta", CRITICAL: "crítica" };
const STATUS: Record<string, string> = { OPEN: "aberta", ACKNOWLEDGED: "assumida" };

type Props = { initial: StageSnapshot | null; initialError: "not-seeded" | "database" | null; pinnedCode: string | null };

/**
 * Sala ao vivo: tela de palco (só para ver). Snapshot do servidor + stream SSE; com o stream fora, consulta o snapshot
 * a cada 5 s e diz isso na tela. Nenhum número nasce aqui: tudo vem do banco, da regra ou do canal ao vivo, com a origem.
 */
export function LiveStage({ initial, initialError, pinnedCode }: Props) {
  const [model, dispatch] = useReducer(reduceStage, initial, initModel);
  const [conn, setConn] = useState<LiveConnState>("connecting");
  const [lostAt, setLostAt] = useState<number | null>(null);
  const [snapError, setSnapError] = useState<string | null>(initialError === "not-seeded" ? "Base não preparada: execute pnpm db:seed." : initialError ? "Banco de dados indisponível." : null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const reduced = useReducedMotion();
  const idle = useIdleCursor(3000);
  useStageKeys();

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
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
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
  const flowOcc = focus ? flowOccurrenceFor(model, focus.id, active) : null;
  const ring = ringView({ rule, broken: focus ? model.broken[focus.id] ?? null : null, occurrence: flowOcc, nowMs: refNow, minFlowLpm: focus?.minFlowLpm ?? 1.5, continuousSeconds: focus?.continuousSeconds ?? 30 });
  const counting = ring.state === "CONTANDO" || ring.state === "BLOQUEADO_REGRA_5";
  const run = counting && rule && ring.observed > 0 ? { from: rule.at - rule.observedSeconds * 1000, to: rule.at } : null;
  const flowSeal = lastReading ? sensorSeal("flow", lastReading.source, rule && rule.sequence === lastReading.sequence ? rule.channel : undefined) : null;

  const temp = latestLive(model.temperature, nextFocus);
  const tempView = temp ? temperatureView(temp, refNow) : null;
  const tempOcc = temp ? active.find(o => o.kind === "TEMPERATURE_EXCURSION" && o.deviceId === temp.deviceId) ?? null : null;
  const scale = latestLive(model.scale, nextFocus);
  const scaleV = scale ? scaleView(scale, model.scaleLots[scale.deviceCode] ?? null, refNow) : null;

  const seal = originSeal(packets(model), refNow);
  const trip = model.trip ? tripView(model.trip, model.offsetMs, model.offsetKnown) : null;
  const lost = conn === "reconnecting" || conn === "down";
  const lostFor = lostAt !== null && model.clientNow !== null ? secondsSince(lostAt, model.clientNow) : null;
  const unit = snap ? [snap.organization.name, snap.organization.city].filter(Boolean).join(" · ") : "—";

  return <main className="stage" data-stage="" data-live-state={conn} data-signal={lost ? "lost" : "ok"} data-idle={idle ? "" : undefined} data-reduced={reduced ? "" : undefined}>
    <header className="stage-head">
      <div className="brand-stage">
        <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3 29 28H3Z" fill="none" stroke="#3fd0a7" strokeWidth="2.6" strokeLinejoin="round" /><path d="M16 13 22 24H10Z" fill="#3fd0a7" opacity=".85" /></svg>
        <b>RICHARDS</b><span>Sala ao vivo</span>
      </div>
      <span className="unit">{unit}</span>
      <time className="clock num" aria-label="Hora de São Paulo">{now !== null ? clockBR(now) : "--:--:--"}</time>
      <span className={`conn ${conn}`} role="status"><i key={model.pulse} className={model.pulse ? "beat" : ""} aria-hidden="true" />{CONN_LABEL[conn]}{conn === "down" ? " · consulta a cada 5 s" : ""}</span>
      <GlobalSeal seal={seal} />
    </header>

    {lost && <div className="lost-banner" role="alert">
      <strong>{lostFor !== null ? <>SINAL PERDIDO há <span className="num">{lostFor}</span> s</> : "SEM STREAM AO VIVO"}</strong>
      <small>{conn === "down" ? "consultando o servidor a cada 5 s · nada é desenhado sem dado" : "reconectando · nada é desenhado sem dado"}</small>
    </div>}
    {snapError && <div className="snap-error" role="alert">{snapError}{snap ? ` · números do snapshot das ${clockBR(Date.parse(snap.serverTime))}` : " · nenhum número é exibido para não apresentar dado falso"}</div>}

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
            <b className="num huge">{lastReading ? fixedBR(lastReading.flowLpm, 2) : "—"}</b>
            <span className="unit-lpm">L/min</span>
            <p className="flow-meta">
              {!lastReading ? "aguardando leitura" : now === null ? " "
                : <>leitura das <span className="mono">{clockBR(lastAt!)}</span>{secondsSince(lastAt!, now) > 2 ? ` · há ${secondsSince(lastAt!, now)} s` : ""}{lastReading ? <> · seq <span className="mono">{lastReading.sequence}</span></> : null}</>}
            </p>
            <p className="flow-note">observado ≠ economizado · suspeita ≠ vazamento comprovado</p>
          </div>
          <figure className="twin">
            <PipeTwin flowLpm={fresh && lastReading ? lastReading.flowLpm : null} tone={pipeTone(ring.state, ring.foreign)} reduced={reduced} />
            <span className="twin-note">representação esquemática</span>
            <figcaption>
              {focus && <span className="twin-tag"><span className="mono">{lastReading && fresh ? `${fixedBR(lastReading.flowLpm, 2)} L/min` : "sem leitura recente"}</span>{flowSeal && <Seal label={flowSeal.label} simulated={flowSeal.simulated} small />}</span>}
            </figcaption>
          </figure>
        </div>
        <FlowStrip points={points} minFlowLpm={focus?.minFlowLpm ?? 1.5} anchorMs={model.anchorMs} offsetMs={model.offsetMs} nowMs={now} run={run} lost={lost} reduced={reduced} />
        <p className="strip-legend"><i className="lg solid" /> sensor <i className="lg dash" /> simulado <i className="lg thr" /> limiar de {fixedBR(focus?.minFlowLpm ?? 1.5, 1)} L/min do dispositivo · janela de {STRIP_WINDOW_MS / 1000} s · sem amostra = sem linha</p>
      </section>

      <RuleRing view={ring} deviceCode={focus?.code ?? null} />

      <TemperaturePanel t={temp} view={tempView} occurrence={tempOcc} nowMs={now} />
      <ScalePanel s={scale} view={scaleV} nowMs={now} />

      <section className="inst today" aria-labelledby="stg-today-title">
        <header className="inst-head"><h2 id="stg-today-title">Hoje</h2>{snap && <span className="inst-code">desde 00:00</span>}</header>
        {!snap ? <p className="waiting">sem dados do servidor</p> : <>
          <div className="count"><b className="num">{kgNumBR(snap.today.deliveredKg.value)}<small> kg</small></b><span>entregues hoje (recebimento) <CounterSeal provenance={snap.today.deliveredKg.provenance} /></span></div>
          <div className="count"><b className="num">{snap.today.pendingReview.value}</b><span>{snap.today.pendingReview.value === 1 ? "lote aguardando" : "lotes aguardando"} verificação humana <CounterSeal provenance={snap.today.pendingReview.provenance} /></span></div>
          <div className="count"><b className="num">{snap.today.activeOccurrences.value}</b><span>{snap.today.activeOccurrences.value === 1 ? "ocorrência ativa" : "ocorrências ativas"} <CounterSeal provenance={snap.today.activeOccurrences.provenance} /></span></div>
          {active[0] && <p className={`occ-latest ${active[0].status === "OPEN" ? "open" : "ack"}`}>
            {/* Origem da ocorrência em destaque: com o contador MISTO, só o selo dela diz se ela é simulada. */}
            <strong><SourceSeal source={active[0].source} />{active[0].title}</strong>
            <span>{STATUS[active[0].status] ?? active[0].status} · {SEVERITY[active[0].severity] ?? active[0].severity} · desde <span className="mono">{hourMinBR(Date.parse(active[0].openedAt))}</span>{active.length > 1 ? ` · +${active.length - 1}` : ""}</span>
          </p>}
        </>}
      </section>

      <EventFeed lines={model.feed} readingCount={model.readingCount} lastReadingAt={model.lastReadingAt} nowMs={now} pulse={model.pulse} />

      <PacketTrip trip={model.trip} view={trip} reduced={reduced} />
    </div>
    <p className="stage-keys" aria-hidden="true">F tela cheia · Esc sai</p>
  </main>;
}
