import { CanvasTexture, NoColorSpace, RepeatWrapping, type Texture } from "three";
import type { FloorMat } from "./site-plan";

/** Micro-relevo e rugosidade independentes da cor. Determinísticos, locais, sem download de HDRI/textura.
 * Altura está em cinza linear; não interpretar uma textura de dados como sRGB. 256² por canal é suficiente
 * para a escala da maquete, sem duplicar os mapas coloridos de 512². */
export function surfaceMaps(kind: FloorMat, anisotropy: number): { bump: Texture; roughness: Texture; depth: number } {
  const size = 256;
  const make = () => { const c = document.createElement("canvas"); c.width = c.height = size; return c; };
  const height = make(), rough = make(), hg = height.getContext("2d")!, rg = rough.getContext("2d")!;
  const hi = hg.createImageData(size, size), ri = rg.createImageData(size, size);
  const tiled = kind === "bathTile" ? 8 : kind === "porcelain" ? 4 : kind === "stone" ? 2 : 0;
  const soft = kind === "grass" || kind === "dirt";
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const hash = Math.imul(x + y * size + 17, 1597334677) ^ Math.imul(y + 31, 3812015801);
    const noise = ((hash >>> 0) % 1000) / 1000;
    let h = 0.7 + (noise - 0.5) * (soft ? 0.45 : 0.045);
    let r = kind === "porcelain" || kind === "bathTile" || kind === "stone" ? 0.65 : 0.92;
    if (tiled) {
      const step = size / tiled;
      if (x % step < 1.6 || y % step < 1.6) { h = 0.22; r = 0.96; }
    } else if (kind === "wood") {
      const row = Math.floor(y / (size / 8)), px = (x + (row % 2) * size / 4) % (size / 2);
      if (y % (size / 8) < 0.8 || px < 0.6) h = 0.22;
      else h += Math.sin(x * 0.11 + Math.sin(y * 0.9)) * 0.018;
      r = 0.78 + noise * 0.08;
    } else if (kind === "pavers") {
      const row = Math.floor(y / 32);
      if (y % 32 < 2 || (x + (row % 2) * 32) % 64 < 2) h = 0.1;
    }
    const at = (y * size + x) * 4;
    hi.data[at] = hi.data[at + 1] = hi.data[at + 2] = Math.round(h * 255); hi.data[at + 3] = 255;
    ri.data[at] = ri.data[at + 1] = ri.data[at + 2] = Math.round(Math.min(1, r + (noise - 0.5) * 0.04) * 255); ri.data[at + 3] = 255;
  }
  hg.putImageData(hi, 0, 0); rg.putImageData(ri, 0, 0);
  const tex = (c: HTMLCanvasElement) => { const t = new CanvasTexture(c); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = NoColorSpace; t.anisotropy = anisotropy; return t; };
  return { bump: tex(height), roughness: tex(rough), depth: soft ? 0.025 : kind === "pavers" ? 0.016 : 0.006 };
}
