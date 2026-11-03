"use client";
import { useEffect, useRef } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { FlaskConical, Info, TrendingDown, TrendingUp } from "lucide-react";
import type { DashboardDTO, Provenance } from "@/modules/analytics/domain/dashboard";
import { dateBR, numBR } from "@/lib/format";
import { usePrefersReducedMotion } from "./hooks";
import { PROVENANCE_LABEL } from "./labels";

export type Tone = "ok" | "warn" | "info" | "neutral" | "danger" | "sim";
export function Tag({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

export function Panel({ eyebrow, title, caption, actions, children, className = "", id }: { eyebrow?: string; title: string; caption?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return <section className={`panel ${className}`} aria-labelledby={id}>
    <header className="panel-head">
      <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2 id={id}>{title}</h2>{caption && <p className="caption">{caption}</p>}</div>
      {actions && <div className="panel-actions">{actions}</div>}
    </header>
    {children}
  </section>;
}

/** Número que transita do valor anterior ao novo (300 ms). Sem animação em loop; respeita "reduzir movimento". */
export function AnimatedNumber({ value, digits = 1 }: { value: number; digits?: number }) {
  const el = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    const from = shown.current, to = value;
    if (from === to || reduced || !el.current) { shown.current = to; if (el.current) el.current.textContent = numBR(to, digits); return; }
    let raf = 0; const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 320), eased = 1 - (1 - k) ** 3;
      const v = from + (to - from) * eased;
      if (el.current) el.current.textContent = numBR(v, digits);
      if (k < 1) raf = requestAnimationFrame(step); else shown.current = to;
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); shown.current = to; };
  }, [value, digits, reduced]);
  return <span ref={el}>{numBR(value, digits)}</span>;
}

export function Sparkline({ data, color }: { data: { t: number; v: number | null }[]; color: string }) {
  if (data.filter(d => d.v !== null).length < 2) return null;
  return <div className="spark" aria-hidden="true">
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs><linearGradient id={`sp-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity={0.22} /><stop offset="1" stopColor={color} stopOpacity={0} /></linearGradient></defs>
        <Area dataKey="v" type="monotone" stroke={color} strokeWidth={1.6} fill={`url(#sp-${color.slice(1)})`} isAnimationActive={false} connectNulls={false} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  </div>;
}

/** Variação contra o período anterior — só quando o backend tem base de comparação com cobertura parecida. */
export function Delta({ current, previous, previousSamples, samples, label }: { current: number | null; previous: number | null; previousSamples: number; samples: number; label: string }) {
  if (current === null) return null;
  if (previous === null || previous === 0 || previousSamples < samples * 0.5) return <span className="delta none" title={`Período anterior com ${previousSamples} leitura(s): base insuficiente para comparar.`}>sem base de comparação</span>;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  return <span className={`delta ${up ? "up" : "down"}`} title={`${label}: ${numBR(previous)} L em ${previousSamples} leituras`}>
    {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{up ? "+" : ""}{numBR(pct, 1)}% <small>vs. {label}</small>
  </span>;
}

export function KpiTile({ label, icon, value, digits = 1, unit, empty, accent, foot, children, spark }: {
  label: string; icon: React.ReactNode; value: number | null; digits?: number; unit?: string; empty?: string; accent: string;
  foot: React.ReactNode; children?: React.ReactNode; spark?: React.ReactNode;
}) {
  return <article className="kpi" style={{ "--kpi": accent } as React.CSSProperties}>
    <div className="kpi-top"><span className="kpi-label">{icon}{label}</span>{children}</div>
    <div className="kpi-mid">
      <div className="kpi-value">{value === null ? <span className="kpi-empty">{empty ?? "sem dados"}</span> : <><AnimatedNumber value={value} digits={digits} />{unit && <small>{unit}</small>}</>}</div>
      {spark}
    </div>
    <div className="kpi-foot"><Info size={12} />{foot}</div>
  </article>;
}

/** Carimbo obrigatório de origem: simulação nunca aparece como medição real (regra inviolável 1). */
export function ProvenanceBanner({ p }: { p: DashboardDTO["provenance"] }) {
  if (p.label === "DEVICE") return null;
  const text: Record<Exclude<Provenance, "DEVICE">, string> = {
    SIMULATED: "Todas as leituras deste recorte foram geradas pelo simulador ou pelo seed de demonstração. Não representam medição real.",
    MIXED: `Este recorte mistura leituras de sensor e simuladas (${p.sources.map(s => `${s.source === "DEVICE" ? "sensor" : s.source === "SIMULATED" ? "simuladas" : "manuais"}: ${s.samples}`).join(" · ")}). Use o filtro de origem para separar.`,
    MANUAL: "Leituras registradas manualmente, sem sensor.",
    NONE: "Nenhuma leitura no período e recorte escolhidos. Os indicadores de água ficam vazios em vez de mostrar zero.",
  };
  return <div className={`prov-banner ${p.label.toLowerCase()}`} role="note">
    <FlaskConical size={15} /><b>{PROVENANCE_LABEL[p.label]}</b><span>{text[p.label]}</span>
  </div>;
}

export function StaleBanner({ since }: { since: string | null }) {
  if (!since) return null;
  return <div className="stale-banner" role="status">Sem conexão com o servidor desde {since}. Os números abaixo estão parados e não são atualizados.</div>;
}

export function EmptyState({ title, children, icon }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return <div className="empty"><span className="empty-icon">{icon ?? <Info size={18} />}</span><b>{title}</b>{children && <p>{children}</p>}</div>;
}

export function PageHeader({ kicker, title, children, actions }: { kicker: string; title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return <div className="page-head">
    <div><span className="kicker">{kicker}</span><h1>{title}</h1>{children && <p>{children}</p>}</div>
    {actions && <div className="page-actions">{actions}</div>}
  </div>;
}

export function Footnote({ data }: { data: DashboardDTO }) {
  return <footer className="meta-foot">
    <span>Gerado {dateBR(data.generatedAt)} · consulta automática a cada 15 s</span>
    <span>{data.provenance.samples} leituras · origem: {PROVENANCE_LABEL[data.provenance.label]}</span>
    <span>Volume observado não é economia comprovada · ocorrência não é vazamento confirmado</span>
  </footer>;
}
