"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Cpu, Download, Droplets, MapPinned, ShieldAlert, TriangleAlert, Zap } from "lucide-react";
import type { DashboardDTO, DashboardOccurrence } from "@/modules/analytics/domain/dashboard";
import { agoBR, dateBR, durationBR, hourBR, numBR } from "@/lib/format";
import { notifyDataChanged, useDashboard, useNow } from "../hooks";
import { useShell } from "../shell";
import { useLiveStream, type LiveView } from "../live-stream";
import { GlobalFilters } from "../filters";
import { Heatmap, LiveSpark, SeriesTable, StatusBreakdown, TableToggle, VolumeChart } from "../charts";
import { Delta, EmptyState, Footnote, KpiTile, PageHeader, Panel, ProvenanceBanner, Seal, StaleBanner, Tag } from "../primitives";
import { activeOrigin, TwinFigure, type TwinState } from "../digital-twin";
import { CONNECTIVITY_LABEL, CONNECTIVITY_TONE, SEVERITY_COLOR, SEVERITY_LABEL, SOURCE_LABEL, STATUS_LABEL, STATUS_TONE } from "../labels";

const SEV_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
const RANGE_TEXT = { "24h": "últimas 24 h", "7d": "últimos 7 dias", "30d": "últimos 30 dias", custom: "período escolhido" } as const;
const PREV_TEXT = { "24h": "24 h anteriores", "7d": "7 dias anteriores", "30d": "30 dias anteriores", custom: "período anterior" } as const;

export function useSimulateAlert() {
  const { toast } = useShell();
  const [busy, setBusy] = useState(false);
  async function simulate() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario: "flow" }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Simulação recusada");
      toast({ tone: "ok", title: "Ocorrência SIMULADA registrada", body: "Gravada com origem SIMULATED e trilha de auditoria." });
      notifyDataChanged();
    } catch (e) { toast({ tone: "warn", title: "Simulação não executada", body: e instanceof Error ? e.message : "Falha" }); }
    finally { setBusy(false); }
  }
  return { simulate, busy };
}

export function AttentionQueue({ items, onOpen }: { items: DashboardOccurrence[]; onOpen: (id: string) => void }) {
  const now = useNow();
  const active = items.filter(o => o.status === "OPEN" || o.status === "ACKNOWLEDGED")
    .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.openedAt.localeCompare(a.openedAt));
  if (!active.length) return <EmptyState title="Nenhuma ocorrência ativa" icon={<CheckCircle2 size={18} />}>Nada aguardando verificação neste recorte.</EmptyState>;
  return <ul className="queue">
    {active.slice(0, 6).map(o => <li key={o.id}>
      <button onClick={() => onOpen(o.id)}>
        <span className="sev-dot" style={{ background: SEVERITY_COLOR[o.severity] }} aria-hidden="true" />
        <span className="queue-main"><b>{o.title}</b><small>{o.deviceCode ?? o.siteName} · severidade {SEVERITY_LABEL[o.severity].toLowerCase()} · {SOURCE_LABEL[o.source]}</small></span>
        <span className="queue-side"><Tag tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Tag><small>{now === null ? hourBR(o.openedAt) : agoBR(new Date(o.openedAt).getTime(), now)}</small></span>
      </button>
    </li>)}
    {active.length > 6 && <li className="queue-more"><Link href="/ocorrencias">+ {active.length - 6} ocorrências ativas</Link></li>}
  </ul>;
}


/** Legenda do painel ao vivo: diz como o número chega AGORA (stream, consulta de reserva ou parado). */
const LIVE_CAPTION: Record<LiveView, string> = {
  connecting: "Conectando ao stream…",
  live: "Ao vivo pelo stream · cada leitura gravada aparece na hora",
  reconnecting: "Reconectando ao stream · consulta a cada 5 s enquanto isso",
  polling: "Consulta a cada 5 s · stream indisponível",
  offline: "Servidor indisponível · números parados",
};
const SIGNAL_FRESH_MS = 120_000;

/**
 * Gêmeo digital da unidade + sinal dos últimos 30 minutos. Painel separado: a leitura nova re-renderiza só ele, não os gráficos.
 * Tudo o que aparece vem do servidor: valor GRAVADO da última leitura, limiar configurado do sensor, contagem de ocorrências ativas.
 */
function TwinPanel({ data }: { data: DashboardDTO }) {
  const { state, live } = useLiveStream();
  const now = useNow();
  const r = live?.lastReading ?? null;
  const atMs = r ? new Date(r.at).getTime() : null;
  const fresh = now !== null && atMs !== null && now - atMs <= SIGNAL_FRESH_MS;
  const device = r ? data.devices.find(d => d.code === r.deviceCode) : undefined;
  const limit = device?.minFlowLpm ?? data.threshold?.minFlowLpm ?? null;
  const twin: TwinState = !r ? "none" : !fresh ? "stale" : r.flowLpm <= 0 ? "idle" : limit !== null && r.flowLpm >= limit ? "over" : "flow";
  const site = device?.siteName ?? data.devices[0]?.siteName ?? data.organization.name;
  const active = live?.activeCount ?? 0;
  // A baliza conta ocorrências de qualquer origem: o selo delas fica ao lado, separado do selo da leitura.
  const origin = activeOrigin(live?.active ?? [], active);
  const originText = origin ? `origem ${origin.label.toLowerCase()}${origin.partial ? ` nas ${origin.listed} mais recentes` : ""}` : "";
  const reading = r ? `${numBR(r.flowLpm, 2)} L/min` : "sem leitura";
  const verdict = !r ? (live ? "Nenhuma leitura recebida." : state === "offline" ? "Servidor indisponível." : "Conectando…")
    : twin === "stale" ? `Última leitura ${dateBR(r.at)}`
    : twin === "idle" ? "Sem fluxo na última leitura"
    : limit === null ? "Sensor sem limiar único"
    : `${twin === "over" ? "Acima" : "Abaixo"} do limiar de ${numBR(limit, 2)} L/min`;
  const label = `Representação esquemática de ${site}. Última leitura: ${reading}${r ? `, ${r.deviceCode}, origem ${SOURCE_LABEL[r.source]}` : ""}. ${verdict}.${active ? ` ${active} ocorrência(s) ativa(s), ${originText}.` : ""}`;

  return <Panel id="p-twin" title="Gêmeo digital · unidade" caption={<>{site} · {LIVE_CAPTION[state]}</>} actions={r ? <Seal source={r.source} /> : undefined} className="twin-panel">
    <figure className={`twin-stage ${twin}`}>
      <span className="twin-note">Representação esquemática</span>
      {active > 0 && <span className="twin-alert" title={`Ocorrências ativas: ${originText}`}>
        <TriangleAlert size={13} /> {active} ocorrência{active > 1 ? "s" : ""} ativa{active > 1 ? "s" : ""}
        {origin && <Seal source={origin.seal}>{origin.label}{origin.partial ? ` · ${origin.listed} mais recentes` : ""}</Seal>}
      </span>}
      <TwinFigure state={twin} display={r ? numBR(r.flowLpm, 2) : "--"} pulseKey={r && fresh && state === "live" ? r.at : null} alert={active > 0} label={label} />
      <figcaption className={`twin-read ${twin}`}>
        <span className="twin-val"><small>{r ? `${r.deviceCode} · vazão` : "Vazão"}</small><strong>{r ? <>{numBR(r.flowLpm, 2)}<small> L/min</small></> : "—"}</strong></span>
        <span className="twin-state">
          <span className="twin-verdict">{verdict}</span>
          {r && <span className="twin-when">{fresh && now !== null ? `comunicando · ${agoBR(atMs!, now)}` : "sem leitura nova há mais de 2 min"}</span>}
        </span>
      </figcaption>
    </figure>
    <div className="twin-sub"><b>Últimos 30 minutos</b>{limit !== null && <span><i className="lg-dash" /> limiar {numBR(limit, 2)} L/min</span>}</div>
    <LiveSpark recent={live?.recent ?? []} threshold={data.threshold?.minFlowLpm ?? null} />
    <ul className="device-mini">
      {data.devices.map(d => <li key={d.id}><Cpu size={15} /><span><b>{d.code}</b><small>{d.label}</small></span><Tag tone={CONNECTIVITY_TONE[d.connectivity]}>{CONNECTIVITY_LABEL[d.connectivity]}</Tag></li>)}
    </ul>
  </Panel>;
}

export function ControlCenter({ initial }: { initial: DashboardDTO }) {
  const { data, stale } = useDashboard(initial);
  const { openOccurrence, openInterval } = useShell();
  const { simulate, busy } = useSimulateAlert();
  const [table, setTable] = useState(false);
  const k = data.kpis;
  const range = RANGE_TEXT[data.filter.range];

  return <>
    <PageHeader kicker={`${data.organization.name} · ${data.organization.city}`} title="Centro de controle" actions={<>
      <a className="btn" href={`/api/reports/summary${data.filter.query ? `?${data.filter.query}` : ""}`}><Download size={15} /> Exportar PDF</a>
      <button className="btn sim" onClick={() => void simulate()} disabled={busy}><Zap size={15} /> Simular alerta</button>
    </>}>Do sinal do sensor à decisão registrada: água observada, pontos mapeados e investigação documentada.</PageHeader>
    <GlobalFilters data={data} />
    <StaleBanner since={stale} />
    <ProvenanceBanner p={data.provenance} />

    <div className="kpi-grid">
      <KpiTile label="Volume observado" icon={<Droplets size={15} />} value={k.observedLiters} unit=" L"
        foot={<>{range} · não equivale a economia</>}>
        <Delta current={k.observedLiters} previous={k.previousLiters} previousSamples={k.previousSamples} samples={data.provenance.samples} label={PREV_TEXT[data.filter.range]} />
      </KpiTile>
      <KpiTile label="Ocorrências ativas" icon={<TriangleAlert size={15} />} value={k.activeOccurrences} digits={0} tone={k.activeOccurrences > 0 ? "warn" : undefined}
        foot={<>{k.openOccurrences} aberta(s) · {k.acknowledgedOccurrences} em análise · exigem verificação humana</>} />
      <KpiTile label="Tempo até resolução" icon={<Clock3 size={15} />} value={k.avgResolutionMin} digits={0} unit=" min" empty="nenhuma resolvida"
        foot={<>média de {k.resolvedInPeriod} resolvida(s){k.avgAckMin !== null ? ` · assumida em ${durationBR(k.avgAckMin)}` : ""} · {range}</>} />
      <KpiTile label="Sensores comunicando" icon={<Cpu size={15} />} value={k.devicesOnline} digits={0} foot={<>{k.devices} sensores de vazão cadastrados</>} />
    </div>

    <Panel id="p-social-facilities" eyebrow="Casas, comércios e edifícios em construção"
      title="Cada ponto de água tem um lugar no mapa"
      caption="Visualize a rede hidráulica, vincule medidores aos pontos e investigue o sinal no local correto."
      actions={<Link href="/monitoramento?source=DEVICE" className="link">Auditar uso e custo da água <ArrowRight size={15} /></Link>}>
      <div className="fixture-intro">
        <span><Droplets size={17} /> <b>Fluxo contínuo:</b> investigar desperdício e custo potencial</span>
        <span><CalendarDays size={17} /> <b>72h sem fluxo:</b> avaliar uso esperado e abrir vistoria manual</span>
        <span><MapPinned size={17} /> <b>Mapa hidráulico:</b> ambientes, ramais e pontos instrumentados</span>
      </div>
      <p className="muted-text small"><ShieldAlert size={14} style={{ verticalAlign: "middle" }} /> Sem fluxo não comprova entupimento; sem comunicação não comprova ausência de uso. Os números de economia dependem de inspeção e comparação real antes/depois.</p>
    </Panel>
    <div className="grid-main">
      <Panel id="p-volume" title="Volume observado por intervalo" className={`dim-${data.filter.bucket}`}
        caption="Clique num ponto para abrir as leituras daquele intervalo."
        actions={<TableToggle on={table} onChange={setTable} />}>
        {table ? <SeriesTable data={data} /> : <VolumeChart data={data} height={310} onBucket={p => openInterval({ start: p.t, end: p.end })} onMarker={openOccurrence} />}
        <div className="chart-legend">
          <span><i className="lg-area" />Volume observado (L)</span>
          <span><i className="lg-dot" style={{ background: SEVERITY_COLOR.HIGH }} />Ocorrência alta</span>
          <span><i className="lg-dot" style={{ background: SEVERITY_COLOR.MEDIUM }} />Média</span>
          <span><i className="lg-dot hollow" />Intervalo em andamento</span>
          <span className="push">Pico de vazão no período <b>{k.peakFlowLpm === null ? "—" : `${numBR(k.peakFlowLpm, 2)} L/min`}</b></span>
        </div>
      </Panel>
      <TwinPanel data={data} />
    </div>

    <div className="grid-half">
      <Panel id="p-queue" title="Fila de atenção" caption="Por severidade e idade" actions={<Link href="/ocorrencias" className="link">Central <ArrowRight size={14} /></Link>}>
        <AttentionQueue items={data.occurrences} onOpen={openOccurrence} />
        <div className="sub-block">
          <span className="sub-title">Abertas no período · <b>{k.openedInPeriod}</b></span>
          <StatusBreakdown items={data.statusBreakdown} />
        </div>
      </Panel>
      <Panel id="p-map" title="Localize o ponto antes de agir" caption="Uma leitura pertence ao medidor vinculado, sem distribuir valores por cômodos não instrumentados."><p>Use uma planta esquemática de casa, comércio ou obra. Pontos sem medidor permanecem sem leitura.</p><Link className="btn primary" href="/mapa"><MapPinned size={16} /> Abrir mapa hidráulico</Link></Panel>
    </div>

    <div className="grid-main">
      <Panel id="p-heat" title="Volume registrado por hora e dia da semana" caption={<>Horário de Brasília. Fluxo na madrugada (0h–5h) é o primeiro lugar para procurar desperdício contínuo: <b>{k.nightLiters === null ? "—" : `${numBR(k.nightLiters)} L`}</b> nessa faixa.</>}>
        <Heatmap cells={data.heatmap} />
      </Panel>
      <Panel id="p-recent" title="Últimas ocorrências" actions={<Link href="/ocorrencias" className="link">Todas <ArrowRight size={14} /></Link>}>
        {data.occurrences.length ? <ul className="recent">
          {data.occurrences.slice(0, 5).map(o => <li key={o.id}><button onClick={() => openOccurrence(o.id)}>
            <i style={{ background: SEVERITY_COLOR[o.severity] }} /><span className="recent-main"><b>{o.title}</b><small>{dateBR(o.openedAt)} · {o.deviceCode ?? "—"} · {SOURCE_LABEL[o.source]}</small></span>
            <Tag tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Tag>
          </button></li>)}
        </ul> : <EmptyState title="Sem ocorrências no período" />}
      </Panel>
    </div>
    <Footnote data={data} />
  </>;
}
