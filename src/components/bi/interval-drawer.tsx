"use client";
import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, X } from "lucide-react";
import type { IntervalDTO } from "@/modules/analytics/domain/dashboard";
import { hourBR, numBR, timeBR, weekdayBR, dayBR } from "@/lib/format";
import { AXIS_TICK, CHART, FLOW, SEVERITY_COLOR, SOURCE_LABEL, STATUS_LABEL, STATUS_TONE, TIP_STYLE } from "./labels";
import { Tag } from "./primitives";
import { useLiveVersion } from "./live-stream";
import { readingInInterval } from "./live-scope";

export type IntervalRequest = { start: number; end: number };

/** Ponto clicado no gráfico → as leituras que o compõem e as ocorrências ligadas por registro (abertura ou janela de evidência). */
export function IntervalDrawer({ request, scope, onClose, onOpenOccurrence }: { request: IntervalRequest; scope: string; onClose: () => void; onOpenOccurrence: (id: string) => void }) {
  const [data, setData] = useState<IntervalDTO | null>(null);
  const [error, setError] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  // Intervalo em andamento: leitura nova do recorte entra na lista (busca espaçada; o total vem do servidor).
  const liveVersion = useLiveVersion("reading.created", e => readingInInterval(e, scope, request.start, request.end), { gap: 3000 });
  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams(scope);
    q.set("start", new Date(request.start).toISOString()); q.set("end", new Date(request.end).toISOString());
    fetch(`/api/analytics/interval?${q}`, { cache: "no-store" })
      .then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.error || "Falha ao carregar o intervalo"); return body as IntervalDTO; })
      .then(d => { if (alive) { setData(d); setError(""); } }, e => { if (alive) setError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Sem conexão com o servidor"); });
    return () => { alive = false; };
  }, [request.start, request.end, scope, liveVersion]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); opener?.focus(); };
  }, []);

  const sameDay = dayBR(request.start) === dayBR(request.end - 1);
  const title = `${weekdayBR(request.start)} ${dayBR(request.start)} · ${hourBR(request.start)} – ${sameDay ? hourBR(request.end) : `${dayBR(request.end)} ${hourBR(request.end)}`}`;
  const chart = data?.readings.map(r => ({ t: new Date(r.at).getTime(), flow: r.flowLpm })) ?? [];
  return <div className="drawer-scrim" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="iv-title" tabIndex={-1} ref={panel}>
      <header className="drawer-head">
        <div><span className="eyebrow">Investigação do intervalo</span><h2 id="iv-title">{title}</h2></div>
        <button className="icon-btn" onClick={onClose} aria-label="Fechar detalhe do intervalo"><X size={17} /></button>
      </header>
      {error && <p role="alert" className="form-error">{error}</p>}
      {!data && !error && <div className="drawer-loading" role="status"><span className="sk" /><span className="sk" /><span className="sk short" /></div>}
      {data && <div className="drawer-body">
        <dl className="facts">
          <div><dt>Leituras</dt><dd>{data.totals.samples}</dd></div>
          <div><dt>Volume observado</dt><dd>{data.totals.samples ? `${numBR(data.totals.liters, 2)} L` : "sem leitura"}</dd></div>
          <div><dt>Vazão máxima</dt><dd>{data.totals.maxFlowLpm !== null ? `${numBR(data.totals.maxFlowLpm, 2)} L/min` : "—"}</dd></div>
          <div><dt>Origem</dt><dd>{data.readings.length ? [...new Set(data.readings.map(r => SOURCE_LABEL[r.source]))].join(" + ") : "—"}</dd></div>
        </dl>

        <h3 className="drawer-section">Ocorrências ligadas a este intervalo</h3>
        {data.occurrences.length ? <ul className="link-list">{data.occurrences.map(o => <li key={o.id}>
          <button onClick={() => onOpenOccurrence(o.id)}>
            <span className="sev-dot" style={{ background: SEVERITY_COLOR[o.severity] }} />
            <span><b>{o.title}</b><small>{o.relation === "OPENED_IN_INTERVAL" ? `aberta às ${hourBR(o.openedAt)}` : "a janela de evidência cruza este intervalo"} · {SOURCE_LABEL[o.source]}</small></span>
            <Tag tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Tag><ArrowUpRight size={15} />
          </button>
        </li>)}</ul>
          : <p className="empty-note">Nenhuma ocorrência registrada neste intervalo. A plataforma não liga leituras a ocorrências por proximidade de horário.</p>}

        <h3 className="drawer-section">Leituras do intervalo</h3>
        {data.readings.length ? <>
          <figure className="evidence-chart" aria-label="Vazão de cada leitura do intervalo">
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={chart} margin={{ top: 6, right: 6, bottom: 0, left: -18 }} barCategoryGap={1}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="t" tickFormatter={t => hourBR(t)} tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={36} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} tickFormatter={v => numBR(v, 1)} />
                <Tooltip cursor={{ fill: "rgba(108, 201, 230, .08)" }} labelFormatter={t => timeBR(new Date(Number(t)))} formatter={v => [`${numBR(Number(v), 2)} L/min`, "Vazão"]} contentStyle={TIP_STYLE} />
                <Bar dataKey="flow" fill={FLOW} radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </figure>
          <div className="table-scroll short">
            <table className="mini-table">
              <caption className="sr-only">Leituras do intervalo selecionado</caption>
              <thead><tr><th scope="col">Hora</th><th scope="col">Sensor</th><th scope="col">Vazão</th><th scope="col">Volume</th><th scope="col">Origem</th></tr></thead>
              <tbody>{data.readings.map(r => <tr key={`${r.deviceCode}:${r.at}:${r.sequence}`}><td>{timeBR(new Date(r.at))}</td><td>{r.deviceCode}</td><td>{numBR(r.flowLpm, 2)} L/min</td><td>{numBR(r.deltaLiters, 3)} L</td><td>{SOURCE_LABEL[r.source]}</td></tr>)}</tbody>
            </table>
          </div>
          {data.truncated && <p className="muted-text small">Mostrando as primeiras {data.readings.length} leituras; os totais acima consideram todas.</p>}
        </> : <p className="empty-note">Nenhuma leitura recebida neste intervalo. Lacuna de comunicação não é contada como consumo zero.</p>}
      </div>}
    </div>
  </div>;
}
