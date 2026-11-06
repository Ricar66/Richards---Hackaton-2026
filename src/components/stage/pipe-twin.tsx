"use client";
import { useRef } from "react";
import { fixedBR, type PipeTone } from "./stage-logic";
import { useFrame } from "./hooks";

/** Água: px do desenho por segundo para cada L/min. Proporcional à vazão medida; 0 = parada. */
const PX_PER_LPM = 30;
const MAX_SPEED = 260;
const PERIOD = 46;
const WATER = { x: 123, y: 203, w: 593, h: 64 };
const TONES: Record<PipeTone, { a: string; b: string; dash: string; glass: string }> = {
  ok: { a: "#3fd0a7", b: "#0f5f57", dash: "#b5ffe9", glass: "#7cdbd0" },
  warn: { a: "#f2a94a", b: "#7a4a0e", dash: "#ffe0ad", glass: "#e9a24b" },
  danger: { a: "#ec6b64", b: "#6e2420", dash: "#ffd0cc", glass: "#f08a84" },
};
// Traços ondulados repetidos a cada PERIOD: deslocar o grupo de 0 a PERIOD dá um laço sem emenda.
const DASHES = Array.from({ length: Math.ceil(WATER.w / PERIOD) + 3 }, (_, i) => {
  const x = WATER.x - PERIOD * 2 + i * PERIOD, y = WATER.y + WATER.h / 2;
  return `M${x} ${y} q6 -6 12 0 t12 0`;
}).join(" ");

/**
 * Gêmeo digital do trecho monitorado (inspirado no `pipe3d` do conceito). Representação esquemática:
 * a velocidade da água vem da última vazão MEDIDA (sem leitura recente = parada), a cor vem do estado da regra.
 */
export function PipeTwin({ flowLpm, tone, reduced }: { flowLpm: number | null; tone: PipeTone; reduced: boolean }) {
  const water = useRef<SVGGElement>(null);
  const phase = useRef(0);
  const speed = flowLpm && flowLpm > 0 ? Math.min(MAX_SPEED, flowLpm * PX_PER_LPM) : 0;
  useFrame((_, dt) => {
    phase.current = (phase.current + speed * dt) % PERIOD;
    if (water.current) water.current.style.transform = `translateX(${phase.current.toFixed(2)}px)`;
  }, !reduced && speed > 0);
  const c = TONES[tone];
  return <svg className="pipe" viewBox="0 0 860 430" role="img" aria-label={`Representação esquemática do cano: ${flowLpm === null ? "sem leitura recente" : `${fixedBR(flowLpm, 2)} L/min`}`}>
    <defs>
      <linearGradient id="stg-metal" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#d7e4e5" /><stop offset=".14" stopColor="#5b8790" /><stop offset=".31" stopColor="#223944" /><stop offset=".57" stopColor="#080f1b" /><stop offset=".78" stopColor="#537987" /><stop offset="1" stopColor="#d1e6de" /></linearGradient>
      <linearGradient id="stg-glass" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#77f7d5" stopOpacity=".55" /><stop offset=".2" stopColor="#0c3e4c" stopOpacity=".7" /><stop offset=".5" stopColor="#1b6f78" stopOpacity=".45" /><stop offset=".82" stopColor="#034056" stopOpacity=".8" /><stop offset="1" stopColor="#82ffff" stopOpacity=".6" /></linearGradient>
      <linearGradient id="stg-metal2" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#a9c8c7" /><stop offset=".3" stopColor="#203943" /><stop offset=".56" stopColor="#091921" /><stop offset="1" stopColor="#7da2a3" /></linearGradient>
      <radialGradient id="stg-water" cx=".5" cy=".5" r=".8"><stop stopColor={c.a} /><stop offset="1" stopColor={c.b} /></radialGradient>
      <filter id="stg-blur"><feGaussianBlur stdDeviation="7" /></filter>
      <clipPath id="stg-water-clip"><rect x={WATER.x} y={WATER.y} width={WATER.w} height={WATER.h} rx="32" /></clipPath>
    </defs>
    <ellipse cx="440" cy="365" rx="335" ry="30" fill={c.a} opacity=".16" filter="url(#stg-blur)" />
    <g transform="rotate(-7 430 240)">
      <rect x="60" y="152" width="718" height="168" rx="84" fill="url(#stg-metal)" />
      <rect x="105" y="172" width="627" height="128" rx="64" fill="url(#stg-glass)" stroke={c.glass} strokeWidth="2" />
      <rect x={WATER.x} y={WATER.y} width={WATER.w} height={WATER.h} rx="32" fill="url(#stg-water)" opacity={speed > 0 ? 0.75 : 0.45} />
      <g clipPath="url(#stg-water-clip)">
        <g ref={water} className="pipe-water"><path d={DASHES} fill="none" stroke={c.dash} strokeWidth="7" strokeLinecap="round" opacity={speed > 0 ? 0.9 : 0.35} /></g>
      </g>
      <path d="M138 187 Q430 160 708 189" fill="none" stroke="#d4ffff" strokeWidth="4" opacity=".5" />
      <ellipse cx="100" cy="236" rx="43" ry="84" fill="url(#stg-metal2)" stroke="#a1cbc8" strokeWidth="4" />
      <ellipse cx="100" cy="236" rx="28" ry="66" fill="#0a2633" stroke={c.glass} strokeWidth="4" />
      <ellipse cx="735" cy="236" rx="43" ry="84" fill="url(#stg-metal2)" stroke="#b0cccd" strokeWidth="4" />
      <ellipse cx="735" cy="236" rx="27" ry="66" fill="#082334" stroke={c.glass} strokeWidth="4" />
      <rect x="343" y="134" width="125" height="29" rx="6" fill="#0c2028" stroke="#76a7ac" />
      <path d="M374 132 376 71 Q405 48 436 73 L436 132" fill="#1b3741" stroke="#80a4aa" strokeWidth="4" />
      <path d="M376 77 Q409 62 436 77 L436 112 Q408 126 376 112Z" fill="url(#stg-metal2)" stroke={c.glass} strokeWidth="3" />
      <rect x="380" y="82" width="53" height="25" rx="3" fill="#142a2d" />
      <text x="406.5" y="100" fill={c.dash} textAnchor="middle" fontSize="15" fontWeight="800" fontFamily="ui-monospace, Consolas, monospace">{flowLpm === null ? "--" : fixedBR(flowLpm, 2)}</text>
    </g>
  </svg>;
}
