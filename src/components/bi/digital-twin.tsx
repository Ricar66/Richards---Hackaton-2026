/**
 * Gêmeo digital da unidade: ilustração isométrica ESQUEMÁTICA (não é planta real), desenhada em SVG próprio.
 * Só mostra estado que veio do servidor: valor da última leitura gravada, se ela é recente, se passa do limiar
 * configurado do sensor e se há ocorrência ativa. A água no cano não "corre" em loop: o medidor pisca uma vez por leitura.
 */
import type { SourceKey } from "@/modules/analytics/domain/dashboard";
import { SOURCE_LABEL } from "./labels";

export type TwinState = "flow" | "over" | "idle" | "stale" | "none";

/**
 * Selo das ocorrências ATIVAS que acendem a baliza. A origem é a de cada ocorrência (não a da última leitura, que tem o
 * próprio selo): SIMULADO, SENSOR, MANUAL ou MISTO. `seal` é a classe do selo: roxo sempre que houver simulada.
 * O servidor lista só as mais recentes (`listed`) e conta todas (`count`): com parte fora da lista, `partial` diz
 * de quantas a origem foi lida. Nada é suposto sobre as não listadas.
 */
export type ActiveOrigin = { label: string; seal: SourceKey; partial: boolean; listed: number };
export function activeOrigin(listed: readonly { source: SourceKey }[], count: number): ActiveOrigin | null {
  if (count <= 0) return null;
  const kinds = new Set(listed.map(o => o.source));
  const partial = listed.length < count;
  const seal: SourceKey = kinds.has("SIMULATED") ? "SIMULATED" : kinds.size === 1 && kinds.has("DEVICE") ? "DEVICE" : "MANUAL";
  const label = kinds.size === 0 ? "Origem não listada" : kinds.size > 1 ? "Misto" : SOURCE_LABEL[[...kinds][0]];
  return { label, seal, partial, listed: listed.length };
}

const K = 21, C = 0.866 * K, S = 0.5 * K, OX = 242, OY = 84;
type V = readonly [number, number, number?];
const pt = ([x, y, z = 0]: V) => [OX + (x - y) * C, OY + (x + y) * S - z * K] as const;
const xy = (v: V) => pt(v).map(n => n.toFixed(1)).join(",");
const poly = (...vs: V[]) => vs.map(xy).join(" ");
/** Caixa isométrica: topo, face esquerda (y máx.) e face direita (x máx.) — as três visíveis deste ângulo. */
function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  return {
    top: poly([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]),
    left: poly([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]),
    right: poly([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]),
  };
}
/** Matriz que deita um desenho 2D na face esquerda (y constante) a partir do ponto `o`. */
const onLeftFace = (o: V) => { const [x, y] = pt(o); return `matrix(${0.866} ${0.5} 0 1 ${x.toFixed(1)} ${y.toFixed(1)})`; };

const PLATE = box(0, 10, 0, 8, -0.35, 0);
const HALL = box(2.5, 7.5, 1.5, 5.5, 0, 3.2);
const ROOF_IN = poly([2.75, 1.75, 3.2], [7.25, 1.75, 3.2], [7.25, 5.25, 3.2], [2.75, 5.25, 3.2]);
const HVAC = box(3.4, 4.9, 2.2, 3.4, 3.2, 3.85);
const METER = box(3.6, 4.8, 6.9, 7.9, 0.15, 1.35);
const ESP = box(1.7, 2.6, 7.3, 8.1, 0, 0.45);
const GRID = [
  ...[1, 2, 3, 4, 5, 6, 7].map(y => [...pt([0, y]), ...pt([10, y])]),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(x => [...pt([x, 0]), ...pt([x, 8])]),
];
const [PAX, PAY] = pt([4.2, 10.4, 0.55]), [PBX, PBY] = pt([4.2, 5.5, 0.55]);
const [MX, MY] = pt([4.2, 7.4, 0]);
const WIRE = [...pt([2.15, 7.7, 0.45]), ...pt([3.6, 7.6, 0.8])];
const LED = pt([2.3, 7.7, 0.45]);
const TREES = ([[0.8, 6.4], [9.1, 1.1], [9.2, 2.3]] as const).map(([x, y]) => ({ base: pt([x, y, 0]), top: pt([x, y, 1.55]) }));
const BEACON = { base: pt([6.4, 2.6, 3.2]), top: pt([6.4, 2.6, 5]) };

const WATER: Record<TwinState, string> = { flow: "#63ebbf", over: "#ffb978", idle: "#35535a", stale: "#35535a", none: "#35535a" };
const EDGE: Record<TwinState, string> = { flow: "#63ebbf", over: "#ffb978", idle: "#63ebbf", stale: "#4b6a70", none: "#4b6a70" };

export function TwinFigure({ state, display, pulseKey, alert, label }: { state: TwinState; display: string; pulseKey: string | null; alert: boolean; label: string }) {
  const water = WATER[state], edge = EDGE[state], live = state !== "stale" && state !== "none";
  return <svg className={`twin-svg ${state}`} viewBox="64 40 392 248" role="img" aria-label={label}>
    {/* placa do terreno com a grade de chão */}
    <polygon points={PLATE.left} fill="#0b1f25" stroke="#1d3a41" />
    <polygon points={PLATE.right} fill="#09191e" stroke="#1d3a41" />
    <polygon points={PLATE.top} fill="#0e252b" stroke="#2a4a51" />
    <g stroke="#17353b" strokeWidth={1}>{GRID.map(([x1, y1, x2, y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />)}</g>

    {TREES.map(({ base, top }, i) => <g key={i}>
      <line x1={base[0]} y1={base[1]} x2={top[0]} y2={top[1]} stroke="#2b5a4c" strokeWidth={4} strokeLinecap="round" />
      <circle cx={top[0]} cy={top[1] - 6} r={11} fill="#173f37" stroke="#2f7a62" strokeWidth={2} />
    </g>)}

    {/* prédio da unidade */}
    <polygon points={HALL.left} fill="#163a40" stroke="#2f6b65" strokeWidth={1.5} />
    <polygon points={HALL.right} fill="#0f2b31" stroke="#2f6b65" strokeWidth={1.5} />
    <polygon points={HALL.top} fill="#1f4c4c" stroke="#4b958a" strokeWidth={1.5} />
    <polygon points={ROOF_IN} fill="#183f40" stroke="#2c6660" />
    <polygon points={poly([2.9, 5.5, 1.95], [5.3, 5.5, 1.95], [5.3, 5.5, 2.6], [2.9, 5.5, 2.6])} fill="#0e2a30" stroke="#3f8f82" />
    <polygon points={poly([7.5, 2, 1.95], [7.5, 5, 1.95], [7.5, 5, 2.6], [7.5, 2, 2.6])} fill="#0b2328" stroke="#2f6b65" />
    <polygon points={poly([5.7, 5.5, 0], [6.7, 5.5, 0], [6.7, 5.5, 1.55], [5.7, 5.5, 1.55])} fill="#0a1d22" stroke="#3f8f82" />
    <polygon points={HVAC.left} fill="#163a40" stroke="#2f6b65" />
    <polygon points={HVAC.right} fill="#0f2b31" stroke="#2f6b65" />
    <polygon points={HVAC.top} fill="#24585a" stroke="#4b958a" />

    {/* ocorrência ativa (contagem do servidor): baliza fixa sobre o telhado, sem pisca-pisca */}
    {alert && <g className="twin-beacon">
      <line x1={BEACON.base[0]} y1={BEACON.base[1]} x2={BEACON.top[0]} y2={BEACON.top[1]} stroke="#ffb978" strokeWidth={2} />
      <ellipse cx={BEACON.base[0]} cy={BEACON.base[1]} rx={16} ry={9} fill="none" stroke="#ffb978" strokeOpacity={0.6} />
      <path d={`M${BEACON.top[0]} ${BEACON.top[1] - 11}l9 11-9 11-9-11z`} fill="#ffb978" />
      <path d={`M${BEACON.top[0]} ${BEACON.top[1] - 5}v6`} stroke="#2a1606" strokeWidth={2} strokeLinecap="round" />
      <circle cx={BEACON.top[0]} cy={BEACON.top[1] + 4} r={1.2} fill="#2a1606" />
    </g>}

    {/* ramal de água entrando na unidade, com o medidor YF-S201 */}
    <line x1={PAX} y1={PAY} x2={PBX} y2={PBY} stroke="#2b4a52" strokeWidth={14} />
    <line x1={PAX} y1={PAY - 4.5} x2={PBX} y2={PBY - 4.5} stroke="#5d8a91" strokeWidth={2} strokeOpacity={0.7} />
    <line x1={PAX} y1={PAY} x2={PBX} y2={PBY} stroke={water} strokeWidth={3.5} strokeDasharray="9 7" />
    <ellipse cx={PAX} cy={PAY} rx={5} ry={8.5} transform={`rotate(-30 ${PAX} ${PAY})`} fill="#1a3238" stroke="#5d8a91" strokeWidth={1.5} />

    <line x1={WIRE[0]} y1={WIRE[1]} x2={WIRE[2]} y2={WIRE[3]} stroke="#4b6a70" strokeWidth={1.5} strokeDasharray="3 3" />
    <polygon points={ESP.left} fill="#13303a" stroke="#3b5f68" />
    <polygon points={ESP.right} fill="#0e252c" stroke="#3b5f68" />
    <polygon points={ESP.top} fill="#1c3e48" stroke="#3b5f68" />
    <circle cx={LED[0]} cy={LED[1]} r={2.4} fill={live ? "#63ebbf" : "#7a8a90"} />

    <polygon points={METER.left} fill="#15323a" stroke={edge} strokeWidth={1.2} />
    <polygon points={METER.right} fill="#0f282f" stroke={edge} strokeWidth={1.2} />
    <polygon points={METER.top} fill="#1d3d43" stroke={edge} strokeWidth={1.2} />
    <g transform={onLeftFace([3.6, 7.9, 0])}>
      <rect x={0.1 * K} y={-1.15 * K} width={1.0 * K} height={0.55 * K} rx={2} fill="#06171b" />
      <text x={0.6 * K} y={-0.73 * K} textAnchor="middle" fontSize={8.5} fontWeight={700} fill={live ? edge : "#7f979d"} style={{ fontVariantNumeric: "tabular-nums" }}>{display}</text>
    </g>
    {pulseKey && <ellipse key={pulseKey} className="twin-pulse" cx={MX} cy={MY} rx={30} ry={17} fill="none" stroke={edge} strokeWidth={2} />}
  </svg>;
}
