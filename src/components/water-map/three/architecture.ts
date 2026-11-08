/** Envoltória arquitetônica em metros. Sem renderer, dados de sensor ou alteração da planta salva.
 * O corte é uma escolha de VISUALIZAÇÃO: não muda altura de peça, posição ou vínculo de medidor.
 */
import { floorY, WALL_H, WALL_T, type SitePlan, type P3 } from "./site-plan";

export const CEILING_H = 2.7;
export const DOOR_H = 2.1;
export type SectionMode = "inspection" | "volume";
export const STOREY_H = 3;
export const floorElevation = (floor: number, mode: SectionMode) => mode === "volume" ? floor * STOREY_H : floorY(floor);
export type ArchitectureMaterial = "plaster" | "cut" | "frame" | "glass" | "sill" | "skirting" | "tile" | "door";
export type ArchitectureBox = {
  material: ArchitectureMaterial; x: number; y: number; z: number; sx: number; sy: number; sz: number;
};
export type WallAssembly = {
  floor: number;
  /** Normal PARA FORA; null é divisória interna, cortada na inspeção. */
  outward: { x: number; z: number } | null;
  lower: ArchitectureBox[]; upper: ArchitectureBox[];
};

/** A fachada que se aproxima da câmera se abre; a fachada do fundo mantém sua altura e suas janelas.
 * Pequena histerese evita alternância na tangência durante o giro. */
export function upperWallVisible(mode: SectionMode, outward: WallAssembly["outward"], view: Pick<P3, "x" | "z">, wasVisible = false): boolean {
  if (mode === "volume") return true;
  if (!outward) return false;
  const length = Math.hypot(view.x, view.z);
  if (length < 1e-6) return false;
  const dot = (outward.x * view.x + outward.z * view.z) / length;
  return dot < (wasVisible ? 0.08 : -0.08);
}

/** Divisórias com vãos REAIS, vergas, caixilhos completos, peitoris e rodapés. O renderer só loteia as caixas. */
export function architecture(plan: SitePlan): WallAssembly[] {
  const inside = (f: number, x: number, z: number) => plan.rooms.find(r => r.floor === f && r.type !== "OUTDOOR" && r.type !== "SITE" && x > r.rect.x0 && x < r.rect.x1 && z > r.rect.z0 && z < r.rect.z1);
  const assemblies: WallAssembly[] = [];
  for (const w of plan.walls) {
    const sx = w.x1 - w.x0, sz = w.z1 - w.z0, x = (w.x0 + w.x1) / 2, z = (w.z0 + w.z1) / 2;
    const alongX = sx >= sz, length = alongX ? sx : sz, thickness = alongX ? sz : sx, off = thickness / 2 + 0.12;
    const a = alongX ? inside(w.floor, x, z - off) : inside(w.floor, x - off, z);
    const b = alongX ? inside(w.floor, x, z + off) : inside(w.floor, x + off, z);
    const outward = !!a === !!b ? null : alongX ? { x: 0, z: a ? 1 : -1 } : { x: a ? 1 : -1, z: 0 };
    const assembly: WallAssembly = { floor: w.floor, outward, lower: [], upper: [] };
    // Divide exatamente no plano de corte; nunca cria geometria de espessura negativa nos vãos.
    const part = (material: ArchitectureMaterial, len: number, bottom: number, top: number, at = 0, t = thickness) => {
      if (len < 0.001 || top - bottom < 0.001) return;
      const add = (lo: number, hi: number, into: ArchitectureBox[]) => {
        if (hi - lo < 0.001) return;
        into.push({ material, x: x + (alongX ? at : 0), y: (lo + hi) / 2, z: z + (alongX ? 0 : at), sx: alongX ? len : t, sy: hi - lo, sz: alongX ? t : len });
      };
      add(bottom, Math.min(top, WALL_H), assembly.lower);
      add(Math.max(bottom, WALL_H), top, assembly.upper);
    };
    const wet = (a ?? b)?.type === "BATHROOM" || (a ?? b)?.type === "LAUNDRY";
    const mat = wet ? "tile" : "plaster";
    const window = outward && length >= 1.65;
    if (!window) part(mat, length, 0, CEILING_H);
    else {
      const sill = wet ? 1.5 : 0.85, head = 2.25, win = Math.min(wet ? 1 : 2.0, length * 0.58), side = (length - win) / 2;
      part(mat, length, 0, sill);
      part(mat, length, head, CEILING_H);
      for (const sign of [-1, 1]) part(mat, side, sill, head, sign * (win + side) / 2);
      part("glass", win - 0.06, sill + 0.04, head - 0.04, 0, 0.012);
      for (const at of [-win / 2, 0, win / 2]) part("frame", 0.035, sill, head, at, 0.05);
      part("frame", win + 0.035, sill, sill + 0.04, 0, 0.055);
      part("frame", win + 0.035, head - 0.04, head, 0, 0.055);
      part("sill", win + 0.12, sill - 0.035, sill, 0, thickness + 0.12);
    }
    part("skirting", length, 0.008, 0.09, 0, thickness + 0.012);
    // A tampa baixa some junto com a parede alta: não há linha escura atravessando a janela inteira.
    assembly.lower.push({ material: "cut", x, y: WALL_H + 0.006, z, sx: sx + 0.002, sy: 0.012, sz: sz + 0.002 });
    assemblies.push(assembly);
  }
  // Vergas e guarnições sobre vãos de porta. Portas do salão permanecem largas e desimpedidas.
  for (const d of plan.doors) {
    const a: WallAssembly = { floor: d.floor, outward: null, lower: [], upper: [] };
    const add = (material: ArchitectureMaterial, len: number, h: number, at: number, y: number, t: number, into: ArchitectureBox[]) => into.push({ material, x: d.x + (d.along === "x" ? at : 0), y, z: d.z + (d.along === "z" ? at : 0), sx: d.along === "x" ? len : t, sy: h, sz: d.along === "x" ? t : len });
    add("plaster", d.width, CEILING_H - DOOR_H, 0, (CEILING_H + DOOR_H) / 2, WALL_T * 2, a.upper);
    add("frame", d.width + 0.09, 0.045, 0, DOOR_H + 0.02, WALL_T * 2 + 0.025, a.upper);
    for (const sign of [-1, 1]) {
      add("frame", 0.045, WALL_H, sign * (d.width / 2 + 0.015), WALL_H / 2, WALL_T * 2 + 0.025, a.lower);
      add("frame", 0.045, DOOR_H - WALL_H, sign * (d.width / 2 + 0.015), (DOOR_H + WALL_H) / 2, WALL_T * 2 + 0.025, a.upper);
    }
    if (d.width <= 1.05) {
      const r = plan.rooms.find(r => r.id === d.rooms[0])!;
      const inward = d.along === "x" ? Math.sign((r.rect.z0 + r.rect.z1) / 2 - d.z) || 1 : Math.sign((r.rect.x0 + r.rect.x1) / 2 - d.x) || 1;
      const x = d.x + (d.along === "x" ? -d.width / 2 + 0.025 : inward * d.width / 2);
      const z = d.z + (d.along === "z" ? -d.width / 2 + 0.025 : inward * d.width / 2);
      const sx = d.along === "x" ? 0.035 : d.width - 0.05, sz = d.along === "z" ? 0.035 : d.width - 0.05;
      a.lower.push({ material: "door", x, y: WALL_H / 2, z, sx, sy: WALL_H, sz });
      a.upper.push({ material: "door", x, y: (DOOR_H + WALL_H) / 2 - 0.015, z, sx, sy: DOOR_H - WALL_H - 0.03, sz });
    }
    assemblies.push(a);
  }
  return assemblies;
}
