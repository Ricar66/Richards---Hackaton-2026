"use client";
import { useState } from "react";
import { CheckCircle2, FileDown, LoaderCircle, TriangleAlert } from "lucide-react";
import type { DashboardDTO } from "@/modules/analytics/domain/dashboard";
import { dateBR, durationBR, numBR, timeBR } from "@/lib/format";
import { reportFigures } from "@/modules/analytics/domain/report-figures";
import { useDashboard } from "../hooks";
import { GlobalFilters } from "../filters";
import { PageHeader, Panel, ProvenanceBanner, StaleBanner, Tag } from "../primitives";
import { CONNECTIVITY_LABEL, DONATION_LABEL, PROVENANCE_LABEL, SEVERITY_LABEL, SOURCE_LABEL, STATUS_LABEL, STATUS_TONE } from "../labels";

type Gen = { state: "idle" } | { state: "busy" } | { state: "done"; at: string; size: number; name: string } | { state: "error"; message: string };

export function Reports({ initial }: { initial: DashboardDTO }) {
  const { data, stale } = useDashboard(initial);
  const [gen, setGen] = useState<Gen>({ state: "idle" });
  const q = data.filter.query;
  const delivered = data.donations.items.filter(d => d.status === "DELIVERED" && d.receivedAt && d.receivedAt >= data.filter.from);

  async function generate() {
    setGen({ state: "busy" });
    try {
      const res = await fetch(`/api/reports/summary${q ? `?${q}` : ""}`, { cache: "no-store" });
      if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error || `Falha ${res.status}`); }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "richards-relatorio.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setGen({ state: "done", at: timeBR(), size: blob.size, name });
    } catch (e) { setGen({ state: "error", message: e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Sem conexão com o servidor" }); }
  }

  return <>
    <PageHeader kicker="Evidência para decisão" title="Relatórios" actions={<button className="btn primary" onClick={() => void generate()} disabled={gen.state === "busy"}>
      {gen.state === "busy" ? <><LoaderCircle size={15} className="spin" /> Gerando PDF…</> : <><FileDown size={15} /> Gerar PDF deste recorte</>}
    </button>}>O PDF usa o mesmo serviço e os mesmos filtros do BI: o que está na prévia é o que vai para o arquivo.</PageHeader>
    <GlobalFilters data={data} />
    <StaleBanner since={stale} />
    <ProvenanceBanner p={data.provenance} />
    {gen.state === "done" && <div className="ok-banner" role="status"><CheckCircle2 size={15} /> {gen.name} gerado às {gen.at} · {numBR(gen.size / 1024, 0)} KB · download iniciado.</div>}
    {gen.state === "error" && <div className="stale-banner" role="alert"><TriangleAlert size={15} /> PDF não gerado: {gen.message}</div>}

    <div className="grid-main">
      <article className="paper" aria-label="Prévia do relatório">
        <header className="paper-head">
          <span className="eyebrow">RICHARDS Intelligence · Relatório de recursos e impacto</span>
          <h2>{data.organization.name}</h2>
          <p>{dateBR(data.filter.from)} → {dateBR(data.filter.to)} · horário de Brasília</p>
          <span className={`stamp ${data.provenance.label.toLowerCase()}`}>{PROVENANCE_LABEL[data.provenance.label]}</span>
        </header>
        <table className="data-table compact figures">
          <caption className="sr-only">Indicadores do período</caption>
          <tbody>{reportFigures(data).map(([l, v]) => <tr key={l}><th scope="row">{l}</th><td className="num">{v}</td></tr>)}</tbody>
        </table>
        <h3>Ocorrências do recorte</h3>
        {data.occurrences.length ? <div className="table-scroll"><table className="data-table compact">
          <thead><tr><th scope="col">Ocorrência</th><th scope="col">Severidade</th><th scope="col">Estado</th><th scope="col">Aberta</th><th scope="col" className="num">Resolução</th><th scope="col">Origem</th></tr></thead>
          <tbody>{data.occurrences.slice(0, 8).map(o => <tr key={o.id}><td>{o.title}<small className="cell-sub">{o.id}</small></td><td>{SEVERITY_LABEL[o.severity]}</td><td><Tag tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Tag></td><td>{dateBR(o.openedAt)}</td><td className="num">{durationBR(o.resolutionMin)}</td><td>{SOURCE_LABEL[o.source]}</td></tr>)}</tbody>
        </table></div> : <p className="muted-text">Sem ocorrências no recorte.</p>}
        <h3>Entregas confirmadas</h3>
        {delivered.length ? <div className="table-scroll"><table className="data-table compact">
          <thead><tr><th scope="col">Lote</th><th scope="col">Instituição</th><th scope="col">Recebido por</th><th scope="col" className="num">Kg</th><th scope="col">Entrega</th></tr></thead>
          <tbody>{delivered.map(d => <tr key={d.id}><td>{d.description}</td><td>{d.recipient ?? "—"}</td><td>{d.receivedBy ?? "não registrado"}</td><td className="num">{numBR(d.kg)}</td><td>{d.receivedAt ? dateBR(d.receivedAt) : "—"}</td></tr>)}</tbody>
        </table></div> : <p className="muted-text">Nenhuma entrega confirmada no período ({DONATION_LABEL.DELIVERED.toLowerCase()} = recebimento registrado).</p>}
        <h3>Dispositivos e qualidade dos dados</h3>
        <div className="table-scroll"><table className="data-table compact">
          <thead><tr><th scope="col">Sensor</th><th scope="col">Comunicação</th><th scope="col">Último contato</th><th scope="col" className="num">Leituras</th></tr></thead>
          <tbody>{data.devices.map(d => <tr key={d.id}><td>{d.code}</td><td>{CONNECTIVITY_LABEL[d.connectivity]}</td><td>{d.lastSeen ? dateBR(d.lastSeen) : "nunca"}</td><td className="num">{d.samples}</td></tr>)}</tbody>
        </table></div>
        <p className="paper-note">Sensor registra fluxo; não prova desperdício, vazamento ou economia. Doações dependem de verificação humana e confirmação de recebimento. Dados simulados ficam carimbados.</p>
      </article>
      <div className="stack">
        <Panel id="p-check" title="BI × PDF" caption="Mesmo serviço (getDashboard) e mesmo filtro na URL.">
          <ul className="check-list">{reportFigures(data).map(([l, v]) => <li key={l}><span>{l}</span><b>{v}</b></li>)}</ul>
          <p className="muted-text small">Arquivo: 2 páginas A4 · rodapé com página e data · nome <code>richards-relatorio-AAAA-MM-DD.pdf</code>.</p>
        </Panel>
        <Panel id="p-prov" title="De onde vêm os números">
          <ul className="check-list">
            {data.provenance.sources.length ? data.provenance.sources.map(s => <li key={s.source}><span>Leituras {SOURCE_LABEL[s.source].toLowerCase()}</span><b>{s.samples}</b></li>) : <li><span>Leituras</span><b>nenhuma</b></li>}
            <li><span>Primeira leitura</span><b>{data.provenance.firstReading ? dateBR(data.provenance.firstReading) : "—"}</b></li>
            <li><span>Última leitura</span><b>{data.provenance.lastReading ? dateBR(data.provenance.lastReading) : "—"}</b></li>
          </ul>
        </Panel>
      </div>
    </div>
  </>;
}
