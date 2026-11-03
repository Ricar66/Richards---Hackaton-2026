"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, Cpu, Download, Droplets, HeartHandshake, Radio, TriangleAlert, Zap } from "lucide-react";
import type { DashboardDTO, DashboardOccurrence } from "@/modules/analytics/domain/dashboard";
import { agoBR, dateBR, durationBR, hourBR, numBR } from "@/lib/format";
import { notifyDataChanged, useDashboard, useNow } from "../hooks";
import { useShell } from "../shell";
import { GlobalFilters } from "../filters";
import { Heatmap, LiveSpark, SeriesTable, StatusBreakdown, TableToggle, VolumeChart } from "../charts";
import { Delta, EmptyState, Footnote, KpiTile, PageHeader, Panel, ProvenanceBanner, Sparkline, StaleBanner, Tag } from "../primitives";
import { CONNECTIVITY_LABEL, CONNECTIVITY_TONE, DONATION_LABEL, SEVERITY_COLOR, SEVERITY_LABEL, SOURCE_LABEL, STATUS_LABEL, STATUS_TONE, WATER } from "../labels";

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
        <span className="sev-bar" style={{ background: SEVERITY_COLOR[o.severity] }} aria-hidden="true" />
        <span className="queue-main"><b>{o.title}</b><small>{o.deviceCode ?? o.siteName} · {SEVERITY_LABEL[o.severity]} · {SOURCE_LABEL[o.source]}</small></span>
        <span className="queue-side"><Tag tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Tag><small>{now === null ? hourBR(o.openedAt) : agoBR(new Date(o.openedAt).getTime(), now)}</small></span>
      </button>
    </li>)}
    {active.length > 6 && <li className="queue-more"><Link href="/ocorrencias">+ {active.length - 6} ocorrências ativas</Link></li>}
  </ul>;
}

export function DonationFlow({ data }: { data: DashboardDTO }) {
  const steps = data.donations.pipeline.filter(p => p.status !== "CANCELLED");
  return <ol className="flow-steps">
    {steps.map((s, i) => <li key={s.status} className={s.status === "DELIVERED" ? "done" : ""}>
      <span className="step-n">{i + 1}</span>
      <span className="step-label">{DONATION_LABEL[s.status]}</span>
      <b>{s.count}</b><small>{numBR(s.kg)} kg</small>
    </li>)}
  </ol>;
}

export function ControlCenter({ initial }: { initial: DashboardDTO }) {
  const { data, stale } = useDashboard(initial);
  const { openOccurrence, openInterval, live } = useShell();
  const { simulate, busy } = useSimulateAlert();
  const [table, setTable] = useState(false);
  const k = data.kpis;
  const range = RANGE_TEXT[data.filter.range];
  const spark = data.series.map(p => ({ t: p.t, v: p.liters }));
  const now = useNow();
  const liveFresh = now !== null && !!live?.lastReading && now - new Date(live.lastReading.at).getTime() <= 120_000;

  return <>
    <PageHeader kicker={`${data.organization.name} · ${data.organization.city}`} title="Centro de controle" actions={<>
      <a className="btn" href={`/api/reports/summary${data.filter.query ? `?${data.filter.query}` : ""}`}><Download size={15} /> Exportar PDF</a>
      <button className="btn dark" onClick={() => void simulate()} disabled={busy}><Zap size={15} /> Simular alerta</button>
    </>}>Do sinal do sensor à decisão registrada: água observada, ocorrências e alimentos entregues no mesmo recorte.</PageHeader>
    <GlobalFilters data={data} />
    <StaleBanner since={stale} />
    <ProvenanceBanner p={data.provenance} />

    <div className="kpi-grid">
      <KpiTile label="Volume observado" icon={<Droplets size={15} />} value={k.observedLiters} unit=" L" accent={WATER}
        foot={<>{range} · não equivale a economia</>} spark={<Sparkline data={spark} color={WATER} />}>
        <Delta current={k.observedLiters} previous={k.previousLiters} previousSamples={k.previousSamples} samples={data.provenance.samples} label={PREV_TEXT[data.filter.range]} />
      </KpiTile>
      <KpiTile label="Ocorrências ativas" icon={<TriangleAlert size={15} />} value={k.activeOccurrences} digits={0} accent="#cf7a12"
        foot={<>agora · exigem verificação humana</>}>
        <span className="kpi-chips"><span>{k.openOccurrences} abertas</span><span>{k.acknowledgedOccurrences} em análise</span></span>
      </KpiTile>
      <KpiTile label="Tempo até resolução" icon={<Clock3 size={15} />} value={k.avgResolutionMin} digits={0} unit=" min" empty="nenhuma resolvida" accent="#4466d6"
        foot={<>média de {k.resolvedInPeriod} resolvida(s) · {range}</>}>
        {k.avgAckMin !== null && <span className="kpi-chips"><span>assumida em {durationBR(k.avgAckMin)}</span></span>}
      </KpiTile>
      <KpiTile label="Alimentos entregues" icon={<HeartHandshake size={15} />} value={k.deliveredKg} unit=" kg" accent="#0e9a73"
        foot={<>{k.deliveredCount} entrega(s) com recebimento confirmado · {range}</>}>
        <span className="kpi-chips"><span>{numBR(k.availableKg)} kg a caminho</span></span>
      </KpiTile>
    </div>

    <div className="grid-main">
      <Panel id="p-volume" eyebrow="Análise hídrica" title="Volume observado por intervalo" className={`dim-${data.filter.bucket}`}
        caption={<>Clique em um ponto para ver as leituras · os marcadores <i className="mk" /> são ocorrências abertas no intervalo · arraste a régua inferior para dar zoom.</>}
        actions={<TableToggle on={table} onChange={setTable} />}>
        {table ? <SeriesTable data={data} /> : <VolumeChart data={data} height={310} onBucket={p => openInterval({ start: p.t, end: p.end })} onMarker={openOccurrence} />}
        <div className="chart-legend">
          <span><i className="lg-area" />Volume observado (L)</span>
          <span><i className="lg-dot" style={{ background: SEVERITY_COLOR.HIGH }} />Ocorrência alta</span>
          <span><i className="lg-dot" style={{ background: SEVERITY_COLOR.MEDIUM }} />Média</span>
          <span><i className="lg-dot hollow" />Intervalo em andamento</span>
          <span className="push">Pico de vazão no período: <b>{k.peakFlowLpm === null ? "—" : `${numBR(k.peakFlowLpm, 2)} L/min`}</b></span>
        </div>
      </Panel>
      <Panel id="p-queue" eyebrow="Agora" title="Fila de atenção" caption="Ordenada por severidade e idade" actions={<Link href="/ocorrencias" className="link">Central <ArrowRight size={14} /></Link>}>
        <AttentionQueue items={data.occurrences} onOpen={openOccurrence} />
        <div className="sub-block">
          <span className="eyebrow">Abertas no período · {k.openedInPeriod}</span>
          <StatusBreakdown items={data.statusBreakdown} />
        </div>
      </Panel>
    </div>

    <div className="grid-main">
      <Panel id="p-heat" eyebrow="Padrão de uso" title="Consumo médio por hora e dia da semana" caption={<>Horário de Brasília · fluxo na madrugada (0h–5h) é o primeiro lugar para procurar desperdício contínuo. Volume nessa faixa: <b>{k.nightLiters === null ? "—" : `${numBR(k.nightLiters)} L`}</b>.</>}>
        <Heatmap cells={data.heatmap} />
      </Panel>
      <Panel id="p-live" eyebrow="Sinal" title="Últimos 30 minutos" caption="Consulta a cada 5 s · não é streaming" actions={<Radio size={16} className={liveFresh ? "pulse-ico" : "muted-ico"} />}>
        {live?.lastReading ? <div className={`live-now ${liveFresh ? "" : "old"}`}>
          <span className="live-num">{numBR(live.lastReading.flowLpm, 2)}<small> L/min</small></span>
          <span className="live-meta">{liveFresh ? "agora" : `última leitura, ${dateBR(live.lastReading.at)}`} · {live.lastReading.deviceCode} · {SOURCE_LABEL[live.lastReading.source]}</span>
        </div> : <p className="empty-note">{live ? "Nenhuma leitura recebida." : "Conectando…"}</p>}
        <LiveSpark recent={live?.recent ?? []} threshold={data.threshold?.minFlowLpm ?? null} />
        <ul className="device-mini">
          {data.devices.map(d => <li key={d.id}><Cpu size={15} /><span><b>{d.code}</b><small>{d.label}</small></span><Tag tone={CONNECTIVITY_TONE[d.connectivity]}>{CONNECTIVITY_LABEL[d.connectivity]}</Tag></li>)}
        </ul>
      </Panel>
    </div>

    <div className="grid-half">
      <Panel id="p-food" eyebrow="Impacto alimentar" title="Do excedente à entrega" caption="Lotes ativos e entregas confirmadas no período · verificação sanitária é humana" actions={<Link href="/doacoes" className="link">Doações <ArrowRight size={14} /></Link>}>
        <DonationFlow data={data} />
      </Panel>
      <Panel id="p-recent" eyebrow="Registro" title="Últimas ocorrências" actions={<Link href="/ocorrencias" className="link">Todas <ArrowRight size={14} /></Link>}>
        {data.occurrences.length ? <ul className="recent">
          {data.occurrences.slice(0, 4).map(o => <li key={o.id}><button onClick={() => openOccurrence(o.id)}>
            <i style={{ background: SEVERITY_COLOR[o.severity] }} /><span className="recent-main"><b>{o.title}</b><small>{dateBR(o.openedAt)} · {o.deviceCode ?? "—"} · {SOURCE_LABEL[o.source]}</small></span>
            <Tag tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Tag>
          </button></li>)}
        </ul> : <EmptyState title="Sem ocorrências no período" />}
      </Panel>
    </div>
    <Footnote data={data} />
  </>;
}
