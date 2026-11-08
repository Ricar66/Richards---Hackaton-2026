"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Area, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, CircleSlash, Snowflake, Thermometer } from "lucide-react";
import type { ColdChainSnapshot, ColdEquipmentView, ColdSource } from "@/modules/cold-chain/application/cold-chain-service";
import { hourBR, dayBR, numBR } from "@/lib/format";
import { AXIS_TICK, CHART, TIP_STYLE } from "../labels";
import { EmptyState, PageHeader, Seal } from "../primitives";
import { useLiveEvent } from "../live-stream";

const PERIODS = [{ h: 24, label: "24 h" }, { h: 168, label: "7 dias" }, { h: 720, label: "30 dias" }] as const;
const STATE = {
  OK: { text: "Na faixa", tone: "ok", Icon: CheckCircle2 },
  OUT_OF_RANGE: { text: "Fora da faixa", tone: "danger", Icon: AlertTriangle },
  NO_DATA: { text: "Sem leitura recente", tone: "neutral", Icon: CircleSlash },
} as const;
const COLD = "#7cc8ff", HOT = "#ff9b6b", OK_BAND = "#1f6b55";
const c1 = (n: number) => `${numBR(n, 1)} °C`;
const ago = (iso: string, now: number) => {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  return m < 1 ? "agora" : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d`;
};

function Chart({ e, hours }: { e: ColdEquipmentView; hours: number }) {
  const { minC, maxC } = e.range;
  const values = e.series.flatMap(p => [p.min, p.max]);
  const lo = Math.min(...values, ...(minC !== null ? [minC] : []), ...(maxC !== null ? [maxC] : []));
  const hi = Math.max(...values, ...(minC !== null ? [minC] : []), ...(maxC !== null ? [maxC] : []));
  const pad = Math.max(1, (hi - lo) * 0.15);
  const domain: [number, number] = [Math.floor(lo - pad), Math.ceil(hi + pad)];
  const color = e.kind === "HOT_HOLDING" ? HOT : COLD;
  const tick = (t: number) => (hours > 24 ? dayBR(t) : hourBR(t));
  return <div className="cc-chart" role="img" aria-label={`Temperatura de ${e.label} no período; faixa permitida ${e.rangeText}.`}>
    <ResponsiveContainer width="100%" height={150}>
      <ComposedChart data={e.series} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
        {/* Faixa permitida sombreada (verde): o que está fora dela salta aos olhos. */}
        <ReferenceArea y1={minC ?? domain[0]} y2={maxC ?? domain[1]} fill={OK_BAND} fillOpacity={0.22} stroke="none" ifOverflow="hidden" />
        {maxC !== null && <ReferenceLine y={maxC} stroke={CHART.threshold} strokeDasharray="4 4" />}
        {minC !== null && <ReferenceLine y={minC} stroke={CHART.threshold} strokeDasharray="4 4" />}
        <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={tick} tick={AXIS_TICK} stroke={CHART.axis} minTickGap={40} />
        <YAxis domain={domain} tick={AXIS_TICK} stroke={CHART.axis} width={44} tickFormatter={v => `${v}°`} />
        <Tooltip contentStyle={TIP_STYLE} labelFormatter={t => `${dayBR(Number(t))} ${hourBR(Number(t))}`}
          formatter={(v: number, name: string) => [c1(v), name === "max" ? "máxima" : name === "min" ? "mínima" : "média"]} />
        <Area dataKey="max" stroke="none" fill={color} fillOpacity={0.12} isAnimationActive={false} />
        <Line dataKey="c" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  </div>;
}

function EquipmentCard({ e, hours, now }: { e: ColdEquipmentView; hours: number; now: number }) {
  const st = STATE[e.state];
  const s = e.summary;
  const longest = s.excursions[0];
  return <article className={`cc-card ${e.state === "OUT_OF_RANGE" ? "out" : ""}`} aria-labelledby={`cc-${e.id}`}>
    <header className="cc-head">
      <div><h3 id={`cc-${e.id}`}>{e.label}</h3><span className="cc-kind">{e.kindLabel} · {e.siteName}</span></div>
      <span className={`tag ${st.tone}`}><st.Icon size={13} aria-hidden="true" />{st.text}</span>
    </header>
    <div className="cc-now">
      <b className="num">{e.last ? numBR(e.last.c, 1) : "—"}<small> °C</small></b>
      <div className="cc-now-meta">
        <span>Faixa: <strong>{e.rangeText}</strong></span>
        <span className="cc-ref">{e.range.reference}</span>
        {e.last && <span>{ago(e.last.at, now)}{e.last.humidityPct !== null ? ` · ${numBR(e.last.humidityPct, 0)}% UR` : ""}</span>}
      </div>
    </div>
    {e.series.length > 1 ? <Chart e={e} hours={hours} /> : <p className="cc-empty">Sem leituras gravadas neste período e origem.</p>}
    <dl className="cc-stats">
      <div><dt>Tempo na faixa</dt><dd>{s.inRangePct === null ? "sem dado" : `${numBR(s.inRangePct, 1)}%`}</dd></div>
      <div><dt>Cobertura</dt><dd title="Parte do período com leitura gravada">{s.coveragePct > 0 && s.coveragePct < 0.1 ? "< 0,1" : numBR(s.coveragePct, s.coveragePct < 10 ? 1 : 0)}%</dd></div>
      <div><dt>Excursões</dt><dd className={s.excursionCount ? "warn" : ""}>{s.excursionCount}</dd></div>
      <div><dt>Mín · máx</dt><dd>{s.minC === null || s.maxC === null ? "—" : `${numBR(s.minC, 1)} · ${numBR(s.maxC, 1)}`}</dd></div>
    </dl>
    {longest && <p className="cc-excursion">
      Maior excursão: <b>{numBR(longest.minutes, 0)} min</b>, pico <b>{c1(longest.peakC)}</b>, desde {hourBR(Date.parse(longest.start))}{longest.ongoing ? " · em andamento" : ""}.
    </p>}
    <footer className="cc-foot">{e.sensorCode ? <>Sensor {e.sensorCode}</> : "Sem sensor vinculado"} · {s.samples} leituras gravadas</footer>
  </article>;
}

/**
 * Cadeia do frio: o registro de temperatura que a RDC 216 manda manter (item 4.8.18), automático e por equipamento.
 * Números só da série gravada, numa origem explícita. Sem leitura: "sem dado", nunca "na faixa".
 */
export function ColdChainView() {
  const [hours, setHours] = useState<number>(24);
  const [source, setSource] = useState<ColdSource>("DEVICE");
  const [data, setData] = useState<ColdChainSnapshot | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const seq = useRef(0), pending = useRef<number | null>(null);
  const load = useCallback(async () => {
    const n = ++seq.current;
    try {
      const r = await fetch(`/api/cold-chain?hours=${hours}&source=${source}`, { cache: "no-store" });
      const d = await r.json();
      if (n !== seq.current) return;
      if (!r.ok) throw new Error(d.error ?? "Consulta indisponível");
      setData(d); setError(""); setNow(Date.parse(d.generatedAt));
    } catch (e) { if (n === seq.current) setError(e instanceof Error ? e.message : "Consulta indisponível"); }
  }, [hours, source]);
  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 30_000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [load]);
  // Leitura nova de temperatura no canal ao vivo: busca de novo (agrupando rajadas em 3 s). O navegador nunca soma evento.
  useLiveEvent("sensor.live", e => {
    if (!e.temperature || pending.current !== null) return;
    pending.current = window.setTimeout(() => { pending.current = null; void load(); }, 3000);
  });
  useEffect(() => () => { if (pending.current !== null) window.clearTimeout(pending.current); }, []);

  const list = data?.equipments ?? [];
  const out = list.filter(e => e.state === "OUT_OF_RANGE").length;
  const excursions = list.reduce((a, e) => a + e.summary.excursionCount, 0);
  return <div className="cc">
    <PageHeader kicker="CADEIA DO FRIO · RDC 216/2004" title="Cada grau, registrado."
      actions={<div className="cc-controls">
        <div className="seg" role="group" aria-label="Período">{PERIODS.map(p => <button key={p.h} type="button" aria-pressed={hours === p.h} onClick={() => setHours(p.h)}>{p.label}</button>)}</div>
        <div className="seg" role="group" aria-label="Origem">
          <button type="button" aria-pressed={source === "DEVICE"} onClick={() => setSource("DEVICE")}>Sensor</button>
          <button type="button" aria-pressed={source === "SIMULATED"} onClick={() => setSource("SIMULATED")}>Simulado</button>
        </div>
      </div>}>
      A norma manda monitorar e registrar a temperatura de armazenamento (item 4.8.18). Aqui o registro é automático, por equipamento, na faixa da norma: o que hoje é planilha de papel vira prova.
    </PageHeader>
    {source === "SIMULATED" && <div className="prov-banner simulated" role="note"><b className="stamp simulated">SIMULADO</b><span>Leituras geradas pela bancada virtual. Não representam medição real.</span></div>}
    {error && <p className="stale-banner" role="alert">{error}{data ? " Mostrando a última consulta." : ""}</p>}
    {data && <div className="cc-kpis">
      <div><Snowflake size={16} aria-hidden="true" /><span>Equipamentos monitorados</span><b>{list.length}</b></div>
      <div className={out ? "warn" : ""}><AlertTriangle size={16} aria-hidden="true" /><span>Fora da faixa agora</span><b>{out}</b></div>
      <div><Thermometer size={16} aria-hidden="true" /><span>Excursões no período</span><b>{excursions}</b></div>
      <div><span>Origem</span><Seal source={source} /></div>
    </div>}
    {!data && !error && <EmptyState title="Consultando a cadeia do frio" />}
    {data && !list.length && <EmptyState title="Nenhum equipamento cadastrado">Cadastre geladeiras, câmaras e balcões com o sensor que os mede.</EmptyState>}
    <div className="cc-grid">{list.map(e => <EquipmentCard key={e.id} e={e} hours={hours} now={now} />)}</div>
    {data && <p className="cc-note">
      Tempo na faixa considera só o tempo com leitura gravada (cobertura ao lado). Cada leitura vale até a próxima, por no máximo 10 minutos; depois disso é buraco, nunca &quot;na faixa&quot;. Sensor DHT11 tem precisão típica de ±2 °C: indício a verificar, não laudo.
    </p>}
  </div>;
}
