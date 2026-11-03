"use client";
import { useMemo, useState } from "react";
import { Area, Brush, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table2 } from "lucide-react";
import type { DashboardDTO, HeatCell, OccurrenceMarker, SeriesPoint } from "@/modules/analytics/domain/dashboard";
import { bucketLabel, dayBR, hourBR, numBR, weekdayBR } from "@/lib/format";
import { usePrefersReducedMotion } from "./hooks";
import { FLOW, SEVERITY_COLOR, SEVERITY_LABEL, STATUS_COLOR, STATUS_LABEL, WATER } from "./labels";

type Bucket = DashboardDTO["filter"]["bucket"];
const AXIS = { fontSize: 11, fill: "#6f8389" };
const bucketOf = (iso: string, series: SeriesPoint[]) => { const t = new Date(iso).getTime(); return series.find(p => t >= p.t && t < p.end) ?? null; };

/** Marcas do eixo em fronteiras legíveis (meia-noite para série horária, horas cheias para 15 min). */
function timeTicks(series: SeriesPoint[], bucket: Bucket) {
  if (bucket === "1d") return { ticks: undefined, fmt: (t: number) => bucketLabel(t, bucket) };
  const days = new Set(series.map(p => dayBR(p.t))).size;
  if (bucket === "1h" && days > 2) return { ticks: series.filter(p => hourBR(p.t) === "00:00").map(p => p.t), fmt: (t: number) => `${weekdayBR(t)} ${dayBR(t)}` };
  const step = bucket === "1h" ? 6 : 3;
  return {
    ticks: series.filter(p => hourBR(p.t).endsWith(":00") && Number(hourBR(p.t).slice(0, 2)) % step === 0).map(p => p.t),
    fmt: (t: number) => hourBR(t) === "00:00" ? `${weekdayBR(t)} ${dayBR(t)}` : hourBR(t),
  };
}

function rangeText(p: SeriesPoint, bucket: Bucket) {
  return bucket === "1d" ? bucketLabel(p.t, bucket, true) : `${bucketLabel(p.t, bucket, true)}–${hourBR(p.end)}`;
}

type TipProps = { active?: boolean; payload?: { payload: SeriesPoint }[]; bucket: Bucket; mode: "volume" | "flow"; markers: OccurrenceMarker[]; series: SeriesPoint[] };
function SeriesTooltip({ active, payload, bucket, mode, markers, series }: TipProps) {
  const p = active && payload?.[0]?.payload;
  if (!p) return null;
  const opened = markers.filter(m => bucketOf(m.openedAt, series)?.t === p.t);
  return <div className="chart-tip">
    <span className="tip-when">{rangeText(p, bucket)}{p.partial && <em> · em andamento</em>}</span>
    {p.samples === 0 ? <strong className="tip-empty">Sem leitura neste intervalo</strong> : mode === "volume"
      ? <strong>{numBR(p.liters ?? 0, 2)} L <small>observados</small></strong>
      : <strong>{numBR(p.maxFlowLpm ?? 0, 2)} L/min <small>vazão máxima</small></strong>}
    {p.samples > 0 && <dl>
      <div><dt>Leituras</dt><dd>{p.samples}</dd></div>
      {mode === "volume" ? <div><dt>Vazão máx.</dt><dd>{numBR(p.maxFlowLpm ?? 0, 2)} L/min</dd></div> : <div><dt>Vazão média</dt><dd>{numBR(p.avgFlowLpm ?? 0, 2)} L/min</dd></div>}
      {mode === "flow" && <div><dt>Volume</dt><dd>{numBR(p.liters ?? 0, 2)} L</dd></div>}
    </dl>}
    {opened.map(m => <span key={m.id} className="tip-occ"><i style={{ background: SEVERITY_COLOR[m.severity] }} />{m.title} · {STATUS_LABEL[m.status]}</span>)}
    <span className="tip-hint">Clique para ver as leituras deste intervalo</span>
  </div>;
}

function MarkerShape({ cx, cy, marker, onOpen }: { cx?: number; cy?: number; marker: OccurrenceMarker; onOpen: (id: string) => void }) {
  if (cx === undefined || cy === undefined) return null;
  const color = SEVERITY_COLOR[marker.severity];
  const open = (e: React.SyntheticEvent) => { e.stopPropagation(); onOpen(marker.id); };
  return <g className="marker" role="button" tabIndex={0} aria-label={`Ocorrência ${marker.title}, severidade ${SEVERITY_LABEL[marker.severity]}, ${STATUS_LABEL[marker.status]}. Abrir detalhe.`}
    onClick={open} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") open(e); }}>
    <circle cx={cx} cy={cy} r={14} fill="transparent" />
    <circle cx={cx} cy={cy} r={8} fill={color} stroke="#fff" strokeWidth={2.5} />
    <path d={`M${cx} ${cy - 3.6}v4.2`} stroke="#fff" strokeWidth={2} strokeLinecap="round" />
    <circle cx={cx} cy={cy + 3.4} r={1.1} fill="#fff" />
  </g>;
}

const isolated = (series: SeriesPoint[], i: number, key: "liters" | "maxFlowLpm") => (series[i - 1]?.[key] ?? null) === null && (series[i + 1]?.[key] ?? null) === null;

function PointDot(props: { cx?: number; cy?: number; payload?: SeriesPoint; index?: number; series: SeriesPoint[] }) {
  const { cx, cy, payload, index = 0, series } = props;
  if (cx === undefined || cy === undefined || !payload || payload.liters === null) return <g />;
  // Intervalo em andamento ganha marca vazada (o total ainda vai crescer).
  if (payload.partial) return <circle cx={cx} cy={cy} r={4} fill="#fff" stroke={WATER} strokeWidth={2} strokeDasharray="2 2" />;
  // Ponto cercado de lacunas não forma linha: sem marca ele sumiria do gráfico.
  if (series.length <= 48 || isolated(series, index, "liters")) return <circle cx={cx} cy={cy} r={3} fill="#fff" stroke={WATER} strokeWidth={2} />;
  return <g />;
}

function FlowDot(props: { cx?: number; cy?: number; payload?: SeriesPoint; index?: number; series: SeriesPoint[]; color: string; field: "maxFlowLpm" | "avgFlowLpm" }) {
  const { cx, cy, payload, index = 0, series } = props;
  if (cx === undefined || cy === undefined || !payload || payload[props.field] === null) return <g />;
  return isolated(series, index, "maxFlowLpm") ? <circle cx={cx} cy={cy} r={2.6} fill={props.color} /> : <g />;
}

/** Série de volume por intervalo: clique em qualquer ponto abre as leituras; marcadores levam à ocorrência. */
export function VolumeChart({ data, height = 300, syncId, brush = true, onBucket, onMarker }: {
  data: DashboardDTO; height?: number; syncId?: string; brush?: boolean;
  onBucket: (p: SeriesPoint) => void; onMarker: (id: string) => void;
}) {
  const reduced = usePrefersReducedMotion();
  const { series, markers, filter } = data;
  const axis = timeTicks(series, filter.bucket);
  const placed = markers.map(m => ({ m, p: bucketOf(m.openedAt, series) })).filter((x): x is { m: OccurrenceMarker; p: SeriesPoint } => !!x.p);
  return <div className="chart" style={{ height }}>
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={series} syncId={syncId} syncMethod="value" margin={{ top: 14, right: 12, bottom: 0, left: 4 }} accessibilityLayer
        onClick={s => { const i = s?.activeTooltipIndex; if (typeof i === "number" && series[i]) onBucket(series[i]); }}>
        <defs><linearGradient id="vol-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={WATER} stopOpacity={0.24} /><stop offset="1" stopColor={WATER} stopOpacity={0.02} /></linearGradient></defs>
        <CartesianGrid stroke="#edf1f0" vertical={false} />
        <XAxis dataKey="t" ticks={axis.ticks} tickFormatter={axis.fmt} tick={AXIS} axisLine={{ stroke: "#dfe6e4" }} tickLine={false} minTickGap={24} interval="preserveStartEnd" />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={58} tickFormatter={v => `${numBR(v, 0)} L`} domain={[0, "auto"]} />
        <Tooltip content={<SeriesTooltip bucket={filter.bucket} mode="volume" markers={markers} series={series} />} cursor={{ stroke: WATER, strokeWidth: 1, strokeOpacity: 0.5 }} />
        <Area dataKey="liters" name="Volume observado" type="monotone" stroke={WATER} strokeWidth={2} fill="url(#vol-fill)" connectNulls={false}
          dot={<PointDot series={series} />} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2, fill: WATER, cursor: "pointer" }}
          isAnimationActive={!reduced} animationDuration={500} />
        {placed.map(({ m, p }) => <ReferenceDot key={m.id} x={p.t} y={p.liters ?? 0} ifOverflow="extendDomain" shape={(s: { cx?: number; cy?: number }) => <MarkerShape cx={s.cx} cy={s.cy} marker={m} onOpen={onMarker} />} />)}
        {brush && series.length > 24 && <Brush dataKey="t" height={26} travellerWidth={9} stroke="#8fb9b2" fill="#f7faf9" tickFormatter={t => bucketLabel(t, filter.bucket)} />}
      </ComposedChart>
    </ResponsiveContainer>
  </div>;
}

/** Vazão (L/min) em gráfico separado do volume: grandezas diferentes nunca dividem eixo. */
export function FlowChart({ data, height = 240, syncId, onBucket }: { data: DashboardDTO; height?: number; syncId?: string; onBucket: (p: SeriesPoint) => void }) {
  const reduced = usePrefersReducedMotion();
  const { series, markers, filter, threshold } = data;
  const axis = timeTicks(series, filter.bucket);
  const windows = markers.filter(m => m.windowStart && m.windowEnd).map(m => ({ m, a: bucketOf(m.windowStart!, series), b: bucketOf(m.windowEnd!, series) })).filter(w => w.a && w.b);
  return <div className="chart" style={{ height }}>
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={series} syncId={syncId} syncMethod="value" margin={{ top: 14, right: 12, bottom: 0, left: 4 }} accessibilityLayer
        onClick={s => { const i = s?.activeTooltipIndex; if (typeof i === "number" && series[i]) onBucket(series[i]); }}>
        <CartesianGrid stroke="#edf1f0" vertical={false} />
        <XAxis dataKey="t" ticks={axis.ticks} tickFormatter={axis.fmt} tick={AXIS} axisLine={{ stroke: "#dfe6e4" }} tickLine={false} minTickGap={24} interval="preserveStartEnd" />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={58} tickFormatter={v => `${numBR(v, 1)}`} domain={[0, (max: number) => Math.max(max, (threshold?.minFlowLpm ?? 0) * 1.25)]} label={{ value: "L/min", position: "insideTopLeft", offset: -2, dy: -12, style: { fontSize: 10, fill: "#6f8389" } }} />
        <Tooltip content={<SeriesTooltip bucket={filter.bucket} mode="flow" markers={markers} series={series} />} cursor={{ stroke: FLOW, strokeWidth: 1, strokeOpacity: 0.5 }} />
        {windows.map(({ m, a, b }) => <ReferenceArea key={m.id} x1={a!.t} x2={b!.t} fill={SEVERITY_COLOR[m.severity]} fillOpacity={0.12} stroke={SEVERITY_COLOR[m.severity]} strokeOpacity={0.35} ifOverflow="extendDomain" />)}
        {threshold && <ReferenceLine y={threshold.minFlowLpm} stroke="#cf7a12" strokeDasharray="6 4" strokeWidth={1.5} label={{ value: `limiar da regra ${numBR(threshold.minFlowLpm, 2)} L/min por ${threshold.continuousSeconds} s`, position: "insideTopRight", style: { fontSize: 10.5, fill: "#9a5a0c", fontWeight: 600 } }} />}
        <Line dataKey="maxFlowLpm" name="Vazão máxima" type="monotone" stroke={FLOW} strokeWidth={2} dot={<FlowDot series={series} color={FLOW} field="maxFlowLpm" />} activeDot={{ r: 4.5, stroke: "#fff", strokeWidth: 2 }} connectNulls={false} isAnimationActive={!reduced} animationDuration={500} />
        <Line dataKey="avgFlowLpm" name="Vazão média" type="monotone" stroke="#8fa6b8" strokeWidth={1.5} dot={<FlowDot series={series} color="#8fa6b8" field="avgFlowLpm" />} activeDot={false} connectNulls={false} isAnimationActive={!reduced} animationDuration={500} />
        {series.length > 24 && <Brush dataKey="t" height={26} travellerWidth={9} stroke="#9fb3c4" fill="#f7f9fb" tickFormatter={t => bucketLabel(t, filter.bucket)} />}
      </ComposedChart>
    </ResponsiveContainer>
  </div>;
}

/** Visão em tabela da série (acessibilidade: nenhum valor fica só no tooltip). */
export function SeriesTable({ data }: { data: DashboardDTO }) {
  const rows = data.series.filter(p => p.samples > 0);
  return <div className="table-scroll">
    <table className="data-table compact">
      <caption className="sr-only">Volume e vazão por intervalo</caption>
      <thead><tr><th scope="col">Intervalo</th><th scope="col" className="num">Volume (L)</th><th scope="col" className="num">Vazão máx. (L/min)</th><th scope="col" className="num">Leituras</th><th scope="col" className="num">Ocorrências</th></tr></thead>
      <tbody>{rows.map(p => <tr key={p.t}><td>{rangeText(p, data.filter.bucket)}{p.partial ? " (em andamento)" : ""}</td><td className="num">{numBR(p.liters ?? 0, 2)}</td><td className="num">{numBR(p.maxFlowLpm ?? 0, 2)}</td><td className="num">{p.samples}</td><td className="num">{p.occurrences || "—"}</td></tr>)}</tbody>
    </table>
    {!rows.length && <p className="muted-text">Nenhum intervalo com leitura.</p>}
  </div>;
}

export function TableToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button className={`btn ghost small ${on ? "on" : ""}`} aria-pressed={on} onClick={() => onChange(!on)}><Table2 size={14} /> {on ? "Ver gráfico" : "Ver tabela"}</button>;
}

const RAMP = ["#e8f5f2", "#c6e6df", "#9bd2c7", "#66b8aa", "#36988b", "#137e77", "#0b5650"];
const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** Padrão semanal: média de litros por hora (Brasília) nos dias com leitura. Célula sem leitura fica hachurada, não clara. */
export function Heatmap({ cells }: { cells: HeatCell[] }) {
  const [hover, setHover] = useState<{ dow: number; hour: number } | null>(null);
  const [table, setTable] = useState(false);
  const map = useMemo(() => new Map(cells.map(c => [`${c.dow}:${c.hour}`, c])), [cells]);
  const values = cells.map(c => c.liters / Math.max(1, c.days));
  const max = values.length ? Math.max(...values) : 0;
  const color = (v: number) => RAMP[Math.min(RAMP.length - 1, Math.floor((v / (max || 1)) * (RAMP.length - 1) + 0.0001))];
  const h = hover ? map.get(`${hover.dow}:${hover.hour}`) : undefined;
  if (!cells.length) return <p className="empty-note">Sem leituras no período para montar o padrão semanal.</p>;
  return <div className="heat-wrap">
    {table ? <><div className="heat-tools"><TableToggle on={table} onChange={setTable} /></div><div className="table-scroll short"><table className="data-table compact">
      <caption className="sr-only">Média de litros por hora e dia da semana</caption>
      <thead><tr><th scope="col">Dia</th><th scope="col">Hora</th><th scope="col" className="num">Média (L/h)</th><th scope="col" className="num">Dias com leitura</th></tr></thead>
      <tbody>{[...cells].sort((a, b) => a.dow - b.dow || a.hour - b.hour).map(c => <tr key={`${c.dow}:${c.hour}`}><td>{DAYS[c.dow - 1]}</td><td>{String(c.hour).padStart(2, "0")}h</td><td className="num">{numBR(c.liters / c.days, 2)}</td><td className="num">{c.days}</td></tr>)}</tbody>
    </table></div></> : <>
      <div className="heat" role="img" aria-label="Mapa de calor do consumo médio por hora e dia da semana. Use Ver tabela para os valores.">
        <span className="heat-night" aria-hidden="true">madrugada</span>
        <span />
        {Array.from({ length: 24 }, (_, hr) => <span key={hr} className="heat-hour">{hr % 3 === 0 ? `${String(hr).padStart(2, "0")}h` : ""}</span>)}
        {DAYS.map((day, i) => <div key={day} className="heat-row">
          <span className="heat-day">{day}</span>
          {Array.from({ length: 24 }, (_, hr) => {
            const c = map.get(`${i + 1}:${hr}`);
            const v = c ? c.liters / Math.max(1, c.days) : null;
            return <span key={hr} className={`heat-cell ${v === null ? "none" : ""} ${hr < 5 ? "night" : ""}`} style={v === null ? undefined : { background: color(v) }}
              onMouseEnter={() => setHover({ dow: i + 1, hour: hr })} onMouseLeave={() => setHover(null)} />;
          })}
        </div>)}
      </div>
      <div className="heat-foot">
        <span className="heat-read" aria-live="off">{hover ? h ? <><b>{DAYS[hover.dow - 1]} {String(hover.hour).padStart(2, "0")}h</b> · média {numBR(h.liters / h.days, 2)} L/h em {h.days} dia(s) com leitura</> : <><b>{DAYS[hover.dow - 1]} {String(hover.hour).padStart(2, "0")}h</b> · sem leitura</> : "Passe o cursor sobre uma célula"}</span>
        <span className="heat-scale"><small>0</small>{RAMP.map(c => <i key={c} style={{ background: c }} />)}<small>{numBR(max, 1)} L/h</small><i className="none" /><small>sem leitura</small></span>
        <TableToggle on={table} onChange={setTable} />
      </div>
    </>}
  </div>;
}

/** Barra segmentada de estados (parte-todo com ≤ 4 partes): rótulo + número sempre ao lado da cor. */
export function StatusBreakdown({ items }: { items: DashboardDTO["statusBreakdown"] }) {
  const total = items.reduce((n, i) => n + i.count, 0);
  return <div className="breakdown">
    <div className="seg-bar" role="img" aria-label={items.map(i => `${STATUS_LABEL[i.status]}: ${i.count}`).join(", ")}>
      {total === 0 ? <span className="seg-empty" /> : items.filter(i => i.count).map(i => <span key={i.status} style={{ flexGrow: i.count, background: STATUS_COLOR[i.status] }} />)}
    </div>
    <ul className="breakdown-list">
      {items.map(i => <li key={i.status}><i style={{ background: STATUS_COLOR[i.status] }} /><span>{STATUS_LABEL[i.status]}</span><b>{i.count}</b><small>{total ? `${Math.round((i.count / total) * 100)}%` : "—"}</small></li>)}
    </ul>
  </div>;
}

export function LiveSpark({ recent, threshold }: { recent: { t: number; flowLpm: number }[]; threshold: number | null }) {
  if (recent.length < 2) return <p className="empty-note">Sem leituras nos últimos 30 minutos.</p>;
  return <div className="chart" style={{ height: 120 }}>
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={recent} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <defs><linearGradient id="live-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={FLOW} stopOpacity={0.25} /><stop offset="1" stopColor={FLOW} stopOpacity={0} /></linearGradient></defs>
        <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={t => hourBR(t)} tick={{ fontSize: 10, fill: "#6f8389" }} axisLine={false} tickLine={false} minTickGap={50} />
        <YAxis tick={{ fontSize: 10, fill: "#6f8389" }} axisLine={false} tickLine={false} width={40} tickCount={4} tickFormatter={v => numBR(v, 1)} domain={[0, (m: number) => Math.max(m, (threshold ?? 0) * 1.2)]} />
        {threshold && <ReferenceLine y={threshold} stroke="#cf7a12" strokeDasharray="5 4" />}
        <Tooltip labelFormatter={t => hourBR(Number(t))} formatter={v => [`${numBR(Number(v), 2)} L/min`, "Vazão"]} contentStyle={{ borderRadius: 10, border: "1px solid #e3e9e7", fontSize: 12 }} />
        <Area dataKey="flowLpm" type="monotone" stroke={FLOW} strokeWidth={2} fill="url(#live-fill)" isAnimationActive={false} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  </div>;
}
