"use client";
import { useEffect, useRef, useState } from "react";
import { Info, TrendingDown, TrendingUp } from "lucide-react";
import type { DashboardDTO, Provenance } from "@/modules/analytics/domain/dashboard";
import { dateBR, numBR } from "@/lib/format";
import { easedValue, progress } from "@/lib/ease";
import { usePrefersReducedMotion } from "./hooks";
import { useLiveState } from "./live-stream";
import { PROVENANCE_LABEL, SOURCE_LABEL } from "./labels";

export type Tone = "ok" | "warn" | "info" | "neutral" | "danger" | "sim";
/** Etiqueta de ESTADO (aberta, entregue, comunicando). Origem do dado não é estado: usa o Seal. */
export function Tag({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

/** Selo de origem (sensor, simulado, manual): contorno, caixa alta. Roxo só para simulado. */
export function Seal({ source, children }: { source: string; children?: React.ReactNode }) {
  const key = source in SOURCE_LABEL ? source as keyof typeof SOURCE_LABEL : null;
  return <span className={`seal ${source.toLowerCase()}`}>{children ?? (key ? SOURCE_LABEL[key] : source)}</span>;
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

/**
 * Número que transita do valor na tela até o novo (320 ms). Sem animação em loop; respeita "reduzir movimento".
 * Um só escritor do texto: o React escreve só o valor da montagem e, daí em diante, só o efeito escreve. Com os dois
 * escrevendo, a tela mostrava o valor novo, voltava a um ponto de partida velho e chegava a exibir um número fora do
 * intervalo (6.466,4 L entre 6.236,7 e 868,3, verificação de 06/11). A transição parte do número que está DE FATO na
 * tela, então nunca sai do intervalo entre valores reais. Contagem inteira troca direto: 1,4 ocorrência não existe.
 */
export function AnimatedNumber({ value, digits = 1 }: { value: number; digits?: number }) {
  const el = useRef<HTMLSpanElement>(null);
  const [initial] = useState(() => numBR(value, digits));
  const onScreen = useRef(value);
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const from = onScreen.current, to = value;
    const paint = (v: number) => { onScreen.current = v; node.textContent = numBR(v, digits); };
    if (from === to || reduced || digits === 0) { paint(to); return; }
    let raf = 0; const start = performance.now();
    const step = (now: number) => {
      // easedValue trava o progresso em [0, 1]: o 1º quadro pode ter tempo ANTERIOR a `start` (ver src/lib/ease.ts).
      paint(easedValue(from, to, now - start));
      if (progress(now - start, 320) < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, digits, reduced]);
  return <span ref={el}>{initial}</span>;
}

/** Variação contra o período anterior — só quando o backend tem base de comparação com cobertura parecida. Texto, não pílula. */
export function Delta({ current, previous, previousSamples, samples, label }: { current: number | null; previous: number | null; previousSamples: number; samples: number; label: string }) {
  if (current === null) return null;
  if (previous === null || previous === 0 || previousSamples < samples * 0.5) return <span className="delta none" title={`Período anterior com ${previousSamples} leitura(s): base insuficiente para comparar.`}>sem base de comparação</span>;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  return <span className={`delta ${up ? "up" : "down"}`} title={`${label}: ${numBR(previous)} L em ${previousSamples} leituras`}>
    {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{up ? "+" : ""}{numBR(pct, 1)}% <small>vs. {label}</small>
  </span>;
}

/**
 * Indicador. Sem faixa lateral nem cor por cartão: o valor só ganha cor quando significa estado (`tone`).
 * `.kpi-value` guarda só número e unidade (o E2E lê esse texto).
 */
export function KpiTile({ label, icon, value, digits = 1, unit, empty, tone, foot, children }: {
  label: string; icon: React.ReactNode; value: number | null; digits?: number; unit?: string; empty?: string; tone?: "warn" | "ok";
  foot: React.ReactNode; children?: React.ReactNode;
}) {
  // A variação (children) fica no rodapé: os números dos quatro cartões ficam na mesma linha.
  return <article className={`kpi ${tone && value !== null ? tone : ""}`}>
    <div className="kpi-top"><span className="kpi-label">{icon}{label}</span></div>
    <div className="kpi-mid">
      <div className="kpi-value">{value === null ? <span className="kpi-empty">{empty ?? "sem dados"}</span> : <><AnimatedNumber value={value} digits={digits} />{unit && <small>{unit}</small>}</>}</div>
    </div>
    <div className="kpi-foot">{children && <div className="kpi-extra">{children}</div>}{foot}</div>
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
    <b className={`stamp ${p.label.toLowerCase()}`}>{PROVENANCE_LABEL[p.label]}</b><span>{text[p.label]}</span>
  </div>;
}

export function StaleBanner({ since }: { since: string | null }) {
  if (!since) return null;
  return <div className="stale-banner" role="status">Sem conexão com o servidor desde {since}. Os números abaixo estão parados e não são atualizados.</div>;
}

export function EmptyState({ title, children, icon }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return <div className="empty"><span className="empty-icon">{icon ?? <Info size={18} />}</span><b>{title}</b>{children && <p>{children}</p>}</div>;
}

/** Título da tela com o contexto (unidade, sensor) ao lado, na mesma linha: o título fala primeiro, sem rótulo em caixa alta acima. */
export function PageHeader({ kicker, title, children, actions }: { kicker: string; title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return <div className="page-head">
    <div><div className="page-title"><h1>{title}</h1><span className="kicker">{kicker}</span></div>{children && <p>{children}</p>}</div>
    {actions && <div className="page-actions">{actions}</div>}
  </div>;
}

export function Footnote({ data }: { data: DashboardDTO }) {
  const state = useLiveState();
  return <footer className="meta-foot">
    <span>Gerado {dateBR(data.generatedAt)} · {state === "live" ? "stream ao vivo: refeito no servidor a cada mudança relevante" : "stream fora: consulta automática a cada 15 s"}</span>
    <span>{data.provenance.samples} leituras · origem: {PROVENANCE_LABEL[data.provenance.label]}</span>
    <span>Volume observado não é economia comprovada · ocorrência não é vazamento confirmado</span>
  </footer>;
}
