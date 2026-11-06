"use client";
import { useEffect, useRef } from "react";
import { STRIP_WINDOW_MS, fixedBR, stripMax, stripSegments, type StripPoint } from "./stage-logic";
import { useElementSize, useFrame } from "./hooks";

type Props = {
  points: StripPoint[]; minFlowLpm: number;
  /** Âncora fixa (hora do servidor) das coordenadas do grupo que rola. */
  anchorMs: number | null; offsetMs: number;
  /** Hora do servidor no último tique (modo sem movimento: a faixa só anda a cada segundo/leitura). */
  nowMs: number | null;
  /** Trecho da contagem atual (sombreado âmbar): início decidido pela regra até a última amostra acima do limiar. */
  run: { from: number; to: number } | null;
  lost: boolean; reduced: boolean;
};
const PAD_TOP = 10, PAD_BOTTOM = 4;
const TICKS = [-120, -90, -60, -30];
const yOf = (v: number, max: number, plotH: number) => PAD_TOP + (1 - Math.min(v, max) / max) * plotH;

/**
 * Faixa da vazão em SVG próprio (sem Recharts): só o grupo dos dados se move, por `transform`, 60 quadros/s.
 * Linha contínua = sensor; tracejada 6/4 = simulado. Buraco > 45 s ou troca de origem = linha interrompida.
 * A linha termina na última amostra; com o sinal perdido, uma faixa hachurada cobre do último dado até agora.
 */
export function FlowStrip({ points, minFlowLpm, anchorMs, offsetMs, nowMs, run, lost, reduced }: Props) {
  const [box, { w, h }] = useElementSize<HTMLDivElement>();
  const group = useRef<SVGGElement>(null);
  const k = w / STRIP_WINDOW_MS;
  const max = stripMax(points, minFlowLpm);
  const plotH = Math.max(1, h - PAD_TOP - PAD_BOTTOM);
  const y = (v: number) => yOf(v, max, plotH);

  // Desenho em coordenadas fixas (relativas à âncora): o quadro a quadro só move o grupo, não refaz o caminho.
  const drawn = (() => {
    if (anchorMs === null || !w) return null;
    const x = (t: number) => (t - anchorMs) * k;
    const last = points.length ? points.reduce((a, b) => (b.t > a.t ? b : a)) : null;
    const to = last ? last.t : anchorMs;
    const segments = stripSegments(points, to - STRIP_WINDOW_MS * 1.5, to);
    return {
      lines: segments.map(seg => {
        const d = seg.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
        const area = seg.length > 1 ? `${d} L${x(seg[seg.length - 1].t).toFixed(1)} ${y(0).toFixed(1)} L${x(seg[0].t).toFixed(1)} ${y(0).toFixed(1)} Z` : null;
        return { key: `${seg[0].t}-${seg[0].source}`, d, area, single: seg.length === 1 ? { cx: x(seg[0].t), cy: y(seg[0].v) } : null, sim: seg[0].source !== "DEVICE" };
      }),
      last: last ? { cx: x(last.t), cy: y(last.v), key: last.t, sim: last.source !== "DEVICE" } : null,
      run: run ? { x: x(run.from), width: Math.max(2, (run.to - run.from) * k) } : null,
      lostX: last ? x(last.t) : null,
    };
  })();

  const place = (serverNow: number) => {
    if (anchorMs === null || !group.current) return;
    group.current.style.transform = `translateX(${(w - (serverNow - anchorMs) * k).toFixed(2)}px)`;
  };
  // Movimento contínuo: hora do servidor estimada a cada quadro (Date.now + ajuste do `hello`).
  useFrame(() => place(Date.now() + offsetMs), !reduced && anchorMs !== null && w > 0);
  // Sem movimento: reposiciona a cada tique/leitura (troca seca).
  useEffect(() => { if (reduced && nowMs !== null) place(nowMs); });

  const threshold = y(minFlowLpm);
  // Eixo: 0, o limiar do dispositivo (em âmbar) e o teto; o teto some se encostar no limiar.
  const ticks = [{ v: 0, thr: false }, { v: minFlowLpm, thr: true }, ...((max - minFlowLpm) / max > 0.18 ? [{ v: max, thr: false }] : [])];
  return <div className="strip" aria-hidden="true">
    <div className="strip-y">
      {h > 0 && ticks.map(t => <span key={t.v} className={t.thr ? "thr" : undefined} style={{ top: `${(y(t.v) / Math.max(1, h)) * 100}%` }}>{fixedBR(t.v, t.v % 1 ? 1 : 0)}</span>)}
    </div>
    <div className="strip-plot" ref={box}>
      {w > 0 && <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <defs>
          <linearGradient id="stg-strip-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#3fd0a7" stopOpacity=".22" /><stop offset="1" stopColor="#3fd0a7" stopOpacity="0" /></linearGradient>
          <pattern id="stg-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#9db3b9" fillOpacity=".05" /><line x1="0" y1="0" x2="0" y2="10" stroke="#9db3b9" strokeOpacity=".35" strokeWidth="3" /></pattern>
          <clipPath id="stg-strip-clip"><rect x="0" y="0" width={w} height={h} /></clipPath>
        </defs>
        <line x1="0" x2={w} y1={y(max)} y2={y(max)} className="strip-grid" />
        <line x1="0" x2={w} y1={y(0)} y2={y(0)} className="strip-base" />
        <g clipPath="url(#stg-strip-clip)">
          <g ref={group} className="strip-data">
            {drawn?.run && <rect className="strip-run" x={drawn.run.x} y={PAD_TOP} width={drawn.run.width} height={plotH} />}
            {drawn?.lines.map(l => <g key={l.key}>
              {l.area && <path d={l.area} fill="url(#stg-strip-fill)" />}
              <path d={l.d} className={l.sim ? "strip-line sim" : "strip-line"} />
              {l.single && <circle cx={l.single.cx} cy={l.single.cy} r="3.5" className="strip-single" />}
            </g>)}
            {drawn?.last && <circle key={drawn.last.key} cx={drawn.last.cx} cy={drawn.last.cy} r="7" className={drawn.last.sim ? "strip-dot sim" : "strip-dot"} />}
            {lost && drawn?.lostX != null && <rect x={drawn.lostX} y={PAD_TOP} width={w * 3} height={plotH} fill="url(#stg-hatch)" />}
          </g>
        </g>
        <line x1="0" x2={w} y1={threshold} y2={threshold} className="strip-threshold" />
      </svg>}
      <div className="strip-x">
        {TICKS.map(s => <span key={s} style={{ left: `${((STRIP_WINDOW_MS / 1000 + s) / (STRIP_WINDOW_MS / 1000)) * 100}%` }}>{s} s</span>)}
        <span style={{ left: "100%" }}>agora</span>
      </div>
    </div>
  </div>;
}
