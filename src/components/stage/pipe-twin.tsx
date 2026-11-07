"use client";
import { useEffect, useRef } from "react";
import { advancePhase, fixedBR, waterSpeed, type PipeTone } from "./stage-logic";
import { useFrame } from "./hooks";

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
 * a velocidade da água vem da última vazão MEDIDA (`waterSpeed`, a mesma conta do 3D; sem leitura recente = parada),
 * a cor vem do estado da regra e a hachura roxa marca leitura simulada dentro do próprio desenho (um print do cano
 * não pode parecer dado real). Sem filtro de desfoque: a sombra e o brilho são gradientes estáticos, então mover a água
 * não obriga o navegador a refiltrar o SVG inteiro a cada quadro.
 * `still` (reduzir movimento ou pausa) e `active=false` (o 3D por cima) param o laço de quadro.
 * `pulseKey` muda a cada leitura GRAVADA do sensor em foco: um anel sai do medidor (cor própria, nunca lido como vazão),
 * no máximo um a cada 500 ms (descarta o desenho, nunca o dado).
 */
export function PipeTwin({ flowLpm, tone, still, simulated, active = true, pulseKey = null }: { flowLpm: number | null; tone: PipeTone; still: boolean; simulated: boolean; active?: boolean; pulseKey?: string | null }) {
  const water = useRef<SVGGElement>(null);
  const ring = useRef<SVGEllipseElement>(null);
  const phase = useRef(0);
  const lastPulse = useRef<{ key: string | null; at: number }>({ key: pulseKey, at: -Infinity });
  const speed = waterSpeed(flowLpm);
  useFrame((_, dt) => {
    phase.current = advancePhase(phase.current, speed, dt, PERIOD);
    if (water.current) water.current.style.transform = `translateX(${phase.current.toFixed(2)}px)`;
  }, active && !still && speed > 0);
  // Só a MUDANÇA para uma chave nova pulsa: a da montagem não (já estava no ref), e null não pulsa nem apaga a referência.
  useEffect(() => {
    const prev = lastPulse.current;
    if (pulseKey === null || pulseKey === prev.key) return;
    lastPulse.current = { key: pulseKey, at: prev.at };
    if (still || !active || typeof ring.current?.animate !== "function") return;
    const now = performance.now();
    if (now - prev.at < 500) return;
    lastPulse.current.at = now;
    const animation = ring.current.animate([{ opacity: 0.95, transform: "scale(1)" }, { opacity: 0, transform: "scale(2.6)" }], { duration: 700, easing: "ease-out" });
    // WAAPI não obedece ao CSS: pausa, troca para 3D e movimento reduzido cancelam o pulso em andamento.
    return () => animation.cancel();
  }, [pulseKey, still, active]);
  const c = TONES[tone];
  const label = `Representação esquemática do cano: ${flowLpm === null ? "sem leitura recente" : `${fixedBR(flowLpm, 2)} L/min`}${simulated ? " · leitura simulada" : ""}`;
  return <svg className="pipe" viewBox="0 0 860 430" role="img" aria-label={label} data-sim={simulated ? "" : undefined}>
    <defs>
      <linearGradient id="stg-metal" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#d7e4e5" /><stop offset=".14" stopColor="#5b8790" /><stop offset=".31" stopColor="#223944" /><stop offset=".57" stopColor="#080f1b" /><stop offset=".78" stopColor="#537987" /><stop offset="1" stopColor="#d1e6de" /></linearGradient>
      <linearGradient id="stg-glass" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#77f7d5" stopOpacity=".55" /><stop offset=".2" stopColor="#0c3e4c" stopOpacity=".7" /><stop offset=".5" stopColor="#1b6f78" stopOpacity=".45" /><stop offset=".82" stopColor="#034056" stopOpacity=".8" /><stop offset="1" stopColor="#82ffff" stopOpacity=".6" /></linearGradient>
      <linearGradient id="stg-metal2" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#a9c8c7" /><stop offset=".3" stopColor="#203943" /><stop offset=".56" stopColor="#091921" /><stop offset="1" stopColor="#7da2a3" /></linearGradient>
      <radialGradient id="stg-water" cx=".5" cy=".5" r=".8"><stop stopColor={c.a} /><stop offset="1" stopColor={c.b} /></radialGradient>
      <radialGradient id="stg-shadow"><stop stopColor="#000" stopOpacity=".55" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
      <radialGradient id="stg-glow"><stop stopColor={c.a} stopOpacity=".34" /><stop offset="1" stopColor={c.a} stopOpacity="0" /></radialGradient>
      <pattern id="stg-sim-hatch" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="18" fill="#b6a3e2" /></pattern>
      <clipPath id="stg-water-clip"><rect x={WATER.x} y={WATER.y} width={WATER.w} height={WATER.h} rx="32" /></clipPath>
    </defs>
    <ellipse cx="440" cy="372" rx="380" ry="38" fill="url(#stg-shadow)" />
    <ellipse cx="440" cy="365" rx="360" ry="44" fill="url(#stg-glow)" />
    <g transform="rotate(-7 430 240)">
      <rect x="60" y="152" width="718" height="168" rx="84" fill="url(#stg-metal)" />
      <rect x="105" y="172" width="627" height="128" rx="64" fill="url(#stg-glass)" stroke={simulated ? "#b6a3e2" : c.glass} strokeWidth={simulated ? 3 : 2} />
      <rect x={WATER.x} y={WATER.y} width={WATER.w} height={WATER.h} rx="32" fill="url(#stg-water)" opacity={speed > 0 ? 0.75 : 0.45} />
      <g clipPath="url(#stg-water-clip)">
        <g ref={water} className="pipe-water"><path d={DASHES} fill="none" stroke={c.dash} strokeWidth="7" strokeLinecap="round" opacity={speed > 0 ? 0.9 : 0.35} /></g>
      </g>
      {/* Hachura fixa por cima da água: o traço corre por baixo dela, então o movimento continua legível. */}
      {simulated && <rect className="pipe-sim" x="105" y="172" width="627" height="128" rx="64" fill="url(#stg-sim-hatch)" opacity=".38" />}
      <path d="M138 187 Q430 160 708 189" fill="none" stroke="#d4ffff" strokeWidth="4" opacity=".5" />
      <ellipse cx="100" cy="236" rx="43" ry="84" fill="url(#stg-metal2)" stroke="#a1cbc8" strokeWidth="4" />
      <ellipse cx="100" cy="236" rx="28" ry="66" fill="#0a2633" stroke={c.glass} strokeWidth="4" />
      <ellipse cx="735" cy="236" rx="43" ry="84" fill="url(#stg-metal2)" stroke="#b0cccd" strokeWidth="4" />
      <ellipse cx="735" cy="236" rx="27" ry="66" fill="#082334" stroke={c.glass} strokeWidth="4" />
      <rect x="343" y="134" width="125" height="29" rx="6" fill="#0c2028" stroke="#76a7ac" />
      <path d="M374 132 376 71 Q405 48 436 73 L436 132" fill="#1b3741" stroke="#80a4aa" strokeWidth="4" />
      <path d="M376 77 Q409 62 436 77 L436 112 Q408 126 376 112Z" fill="url(#stg-metal2)" stroke={c.glass} strokeWidth="3" />
      <ellipse ref={ring} className="pipe-pulse" cx="406" cy="95" rx="46" ry="34" fill="none" stroke="#eafffb" strokeWidth="4" />
      <rect x="380" y="82" width="53" height="25" rx="3" fill="#142a2d" />
      <text x="406.5" y="100" fill={c.dash} textAnchor="middle" fontSize="15" fontWeight="800" fontFamily="ui-monospace, Consolas, monospace">{flowLpm === null ? "--" : fixedBR(flowLpm, 2)}</text>
    </g>
  </svg>;
}
