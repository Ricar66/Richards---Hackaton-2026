/**
 * Rótulos da maquete sem encavalar (puro, testável), em duas passadas:
 * 1) todo ponto ganha pelo menos o NÚMERO (do mais importante ao menos importante) — nenhum ponto some à toa;
 * 2) o número vira rótulo CHEIO (nome + leitura) onde couber sem bater em nenhum outro.
 * Número que bate em outro número vira um PONTO na cor do estado (clicável, com o nome no título): nada some.
 * O selecionado sempre aparece cheio.
 */
export type LabelInput = { id: string; x: number; y: number; title: string; sub: string; priority: number; selected: boolean };
export type LabelMode = "full" | "mini" | "dot";
export type Rect = { x0: number; y0: number; x1: number; y1: number };
export const hit = (a: Rect, b: Rect) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/** Retângulo em px de cada formato (âncora embaixo, no centro, como no CSS: translate(-50%, -100%)). */
export function labelRect(l: Pick<LabelInput, "x" | "y" | "title" | "sub">, mode: "full" | "mini"): Rect {
  if (mode === "mini") return { x0: l.x - 14, y0: l.y - 30, x1: l.x + 14, y1: l.y };
  const w = Math.min(232, 44 + 6.6 * Math.max(l.title.length, l.sub.length));
  return { x0: l.x - w / 2, y0: l.y - 38, x1: l.x + w / 2, y1: l.y };
}

/** O selecionado continua legível junto às bordas no retrato e depois de aproximar a câmera.
 * Só desloca o rótulo; a linha de chamada mantém a posição verdadeira do ponto na maquete. */
export function fitLabelAnchor(l: Pick<LabelInput, "x" | "y" | "title" | "sub">, width: number, height: number, toolbarBottom: number) {
  const rect = labelRect(l, "full"), half = Math.min((rect.x1 - rect.x0) / 2, Math.max(0, width / 2 - 8));
  return { x: Math.max(half + 8, Math.min(width - half - 8, l.x)), y: Math.max(toolbarBottom + 42, Math.min(height - 40, l.y)) };
}

export function layoutLabels(items: LabelInput[], opts: { narrow: boolean; reserved?: Rect[] }): Map<string, LabelMode> {
  const reserved = opts.reserved ?? [], out = new Map<string, LabelMode>(), rect = new Map<string, Rect>();
  const order = [...items].sort((a, b) => (a.selected === b.selected ? a.priority - b.priority : a.selected ? -1 : 1));
  const others = (id: string) => [...reserved, ...[...rect].filter(([k]) => k !== id).map(([, r]) => r)];
  for (const l of order) {
    const r = labelRect(l, l.selected ? "full" : "mini");
    if (l.selected || !others(l.id).some(p => hit(p, r))) { out.set(l.id, l.selected ? "full" : "mini"); rect.set(l.id, r); }
    else out.set(l.id, "dot");
  }
  if (!opts.narrow) for (const l of order) {
    if (out.get(l.id) !== "mini") continue;
    const full = labelRect(l, "full");
    if (!others(l.id).some(p => hit(p, full))) { out.set(l.id, "full"); rect.set(l.id, full); }
  }
  return out;
}
