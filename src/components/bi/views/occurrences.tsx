"use client";
import { useMemo, useState } from "react";
import { ArrowDownUp, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Eye, Search, TriangleAlert, Zap } from "lucide-react";
import type { DashboardDTO, OccurrenceStatus, Severity } from "@/modules/analytics/domain/dashboard";
import { dateBR, durationBR } from "@/lib/format";
import { useDashboard } from "../hooks";
import { useShell } from "../shell";
import { GlobalFilters } from "../filters";
import { StatusBreakdown } from "../charts";
import { EmptyState, Footnote, KpiTile, PageHeader, Panel, StaleBanner, Tag } from "../primitives";
import { KIND_LABEL, SEVERITY_COLOR, SEVERITY_LABEL, SOURCE_LABEL, STATUS_COLOR, STATUS_LABEL, STATUS_TONE } from "../labels";
import { AttentionQueue, useSimulateAlert } from "./control-center";

const PAGE = 10;
const VIEWS: { key: "active" | "all" | OccurrenceStatus; label: string }[] = [
  { key: "active", label: "Ativas" }, { key: "all", label: "Todas" }, { key: "OPEN", label: "Abertas" },
  { key: "ACKNOWLEDGED", label: "Em análise" }, { key: "RESOLVED", label: "Resolvidas" }, { key: "DISMISSED", label: "Descartadas" },
];

export function Occurrences({ initial }: { initial: DashboardDTO }) {
  const { data, stale } = useDashboard(initial);
  const { openOccurrence } = useShell();
  const { simulate, busy } = useSimulateAlert();
  const [view, setView] = useState<(typeof VIEWS)[number]["key"]>("all");
  const [severity, setSeverity] = useState<Severity | "">("");
  const [q, setQ] = useState("");
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(0);
  const k = data.kpis;

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.occurrences
      .filter(o => view === "all" || (view === "active" ? o.status === "OPEN" || o.status === "ACKNOWLEDGED" : o.status === view))
      .filter(o => !severity || o.severity === severity)
      .filter(o => !term || [o.title, o.description, o.deviceCode ?? "", o.id].some(s => s.toLowerCase().includes(term)))
      .sort((a, b) => (asc ? 1 : -1) * a.openedAt.localeCompare(b.openedAt));
  }, [data.occurrences, view, severity, q, asc]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE, current * PAGE + PAGE);
  const count = (key: (typeof VIEWS)[number]["key"]) => key === "all" ? data.occurrences.length : key === "active" ? data.occurrences.filter(o => o.status === "OPEN" || o.status === "ACKNOWLEDGED").length : data.occurrences.filter(o => o.status === key).length;

  return <>
    <PageHeader kicker="Operação & resposta" title="Central de ocorrências" actions={<button className="btn dark" onClick={() => void simulate()} disabled={busy}><Zap size={15} /> Simular alerta</button>}>
      Cada suspeita tem origem, evidência, responsável e trilha. Resolver exige descrever a verificação feita.
    </PageHeader>
    <GlobalFilters data={data} />
    <StaleBanner since={stale} />
    <div className="kpi-grid">
      <KpiTile label="Abertas agora" icon={<TriangleAlert size={15} />} value={k.openOccurrences} digits={0} accent={STATUS_COLOR.OPEN} foot="aguardam alguém assumir" />
      <KpiTile label="Em análise agora" icon={<Eye size={15} />} value={k.acknowledgedOccurrences} digits={0} accent={STATUS_COLOR.ACKNOWLEDGED} foot="investigação assumida" />
      <KpiTile label="Resolvidas no período" icon={<CheckCircle2 size={15} />} value={k.resolvedInPeriod} digits={0} accent={STATUS_COLOR.RESOLVED} foot={`${k.dismissedInPeriod} descartada(s) como falso alarme`} />
      <KpiTile label="Tempo até resolução" icon={<Clock3 size={15} />} value={k.avgResolutionMin} digits={0} unit=" min" empty="nenhuma resolvida" accent="#6f8389" foot={`assumida em média em ${durationBR(k.avgAckMin)}`} />
    </div>
    <div className="grid-main reverse">
      <Panel id="p-occ-table" eyebrow="Registro completo" title="Ocorrências do recorte" caption="Abertas no período ou ainda ativas. Clique para ver evidência, timeline e ações.">
        <div className="toolbar">
          <label className="search"><Search size={15} /><span className="sr-only">Buscar ocorrência</span>
            <input type="search" placeholder="Buscar por título, sensor ou ID" value={q} onChange={e => { setQ(e.target.value); setPage(0); }} />
          </label>
          <div className="chips" role="group" aria-label="Estado">
            {VIEWS.map(v => <button key={v.key} aria-pressed={view === v.key} onClick={() => { setView(v.key); setPage(0); }}>{v.label}<small>{count(v.key)}</small></button>)}
          </div>
          <label className="select small"><span className="sr-only">Severidade</span>
            <select value={severity} onChange={e => { setSeverity(e.target.value as Severity | ""); setPage(0); }}>
              <option value="">Todas as severidades</option>
              {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as Severity[]).map(s => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}
            </select>
          </label>
        </div>
        {visible.length ? <div className="table-scroll">
          <table className="data-table rows-click">
            <caption className="sr-only">Ocorrências filtradas, página {current + 1} de {pages}</caption>
            <thead><tr>
              <th scope="col">Ocorrência</th><th scope="col">Sensor</th><th scope="col">Origem</th><th scope="col">Estado</th>
              <th scope="col" aria-sort={asc ? "ascending" : "descending"}><button className="th-sort" onClick={() => setAsc(a => !a)}>Aberta em <ArrowDownUp size={12} /></button></th>
              <th scope="col" className="num">Resolução</th>
            </tr></thead>
            <tbody>{visible.map(o => <tr key={o.id} onClick={() => openOccurrence(o.id)}>
              <td><button className="row-open" onClick={e => { e.stopPropagation(); openOccurrence(o.id); }}>
                <span className="sev-bar" style={{ background: SEVERITY_COLOR[o.severity] }} aria-hidden="true" />
                <span><b>{o.title}</b><small className="cell-sub">{KIND_LABEL[o.kind] ?? o.kind} · severidade {SEVERITY_LABEL[o.severity].toLowerCase()}</small></span>
              </button></td>
              <td className="nowrap">{o.deviceCode ?? "—"}</td>
              <td><Tag tone={o.source === "DEVICE" ? "ok" : "sim"}>{SOURCE_LABEL[o.source]}</Tag></td>
              <td><Tag tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Tag></td>
              <td className="nowrap">{dateBR(o.openedAt)}</td>
              <td className="num">{o.resolutionMin === null ? "—" : durationBR(o.resolutionMin)}</td>
            </tr>)}</tbody>
          </table>
        </div> : <EmptyState title="Nenhuma ocorrência com estes filtros">Ajuste a busca, o estado ou o período.</EmptyState>}
        <div className="pager">
          <span>{rows.length} ocorrência(s) · página {current + 1} de {pages}</span>
          <button className="icon-btn" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Página anterior"><ChevronLeft size={16} /></button>
          <button className="icon-btn" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Próxima página"><ChevronRight size={16} /></button>
        </div>
      </Panel>
      <div className="stack">
        <Panel id="p-occ-queue" eyebrow="Agora" title="Fila de atenção"><AttentionQueue items={data.occurrences} onOpen={openOccurrence} /></Panel>
        <Panel id="p-occ-status" eyebrow={`Abertas no período · ${k.openedInPeriod}`} title="Situação atual"><StatusBreakdown items={data.statusBreakdown} /></Panel>
      </div>
    </div>
    <Footnote data={data} />
  </>;
}
