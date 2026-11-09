/** Modelos de louças e equipamentos em metros, sem DOM/GPU; as peças ilustram o cadastro, não medições. */
import { BoxGeometry, BufferGeometry, CylinderGeometry, Euler, ExtrudeGeometry, LatheGeometry, Material, Matrix4, Path, Quaternion, Shape, TorusGeometry, Vector2, Vector3 } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { Fixture, WaterLayout } from "@/modules/water-map/domain/layout";
import { FIXTURE_DEPTH, FIXTURE_WIDTH, type Mat } from "./site-plan";

export type FixtureMaterial = "bronze" | "ceramic" | "chrome" | "dial" | "drain" | "hose" | "orange" | "tankBlue" | "tankLid" | "valveBlue" | "valveRed";
export type Part = { geo: BufferGeometry; mat: Material; m: Matrix4 };
export type FixtureModel = { parts: Part[]; top: number; spouts: { a: Vector3; b: Vector3 }[]; sensor: Vector3 };
const M4 = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(rx, ry, rz)), new Vector3(sx, sy, sz));

export function fixtureModel(fx: Fixture, kind: WaterLayout["kind"], floor: number, D: Record<Mat, Material>, F: Record<FixtureMaterial, Material>): FixtureModel {
  const parts: Part[] = [], d = FIXTURE_DEPTH[fx], w = FIXTURE_WIDTH[fx], back = -d / 2;
  const put = (geo: BufferGeometry, mat: Material, m: Matrix4) => parts.push({ geo, mat, m });
  const box = (sx: number, sy: number, sz: number, mat: Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => put(new BoxGeometry(sx, sy, sz), mat, M4(x, y, z, rx, ry, rz));
  const cyl = (rt: number, rb: number, h: number, mat: Material, x: number, y: number, z: number, rx = 0, rz = 0, seg = 20, sz = 1) => put(new CylinderGeometry(rt, rb, h, seg), mat, M4(x, y, z, rx, 0, rz, 1, 1, sz));
  const tor = (r: number, t: number, mat: Material, x: number, y: number, z: number, rx = 0, ry = 0, arc = Math.PI * 2, sz = 1) => put(new TorusGeometry(r, t, 8, 24, arc), mat, M4(x, y, z, rx, ry, 0, 1, 1, sz));
  const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
  // Cuba côncava de verdade: perfil com espessura, boca aberta e dreno. Nenhum plano escuro fingindo profundidade.
  const bowl = (rx: number, rz: number, height: number, rim: number, mat: Material, x = 0, z = 0) => {
    const profile = [[0.032, -height], [rx * 0.5, -height], [rx * 0.82, -height * 0.7], [rx * 0.98, -0.025], [rx, 0], [rx * 0.93, 0.005], [rx * 0.9, -0.025], [rx * 0.73, -height * 0.68], [rx * 0.45, -height + 0.018], [0.032, -height + 0.018]];
    put(new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 28), mat, M4(x, rim, z, 0, 0, 0, 1, 1, rz / rx));
    cyl(0.032, 0.032, 0.006, F.drain, x, rim - height + 0.02, z, 0, 0, 16);
    for (const dx of [-0.012, 0, 0.012]) box(0.003, 0.002, 0.04, D.steel, x + dx, rim - height + 0.025, z);
  };
  const counter = (width: number, depth: number, rx: number, rz: number, mat: Material, z = 0) => {
    const shape = new Shape(); shape.moveTo(-width / 2, -depth / 2); shape.lineTo(width / 2, -depth / 2); shape.lineTo(width / 2, depth / 2); shape.lineTo(-width / 2, depth / 2); shape.closePath();
    const hole = new Path(); hole.absellipse(0, -z, rx * 0.94, rz * 0.94, 0, Math.PI * 2, true); shape.holes.push(hole);
    put(new ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: false, curveSegments: 24 }), mat, M4(0, 0.868, 0, -Math.PI / 2));
  };
  let top = 1, spouts: FixtureModel["spouts"] = [], sensor = V(-w / 2 - 0.12, 0.14, back + 0.1);
  switch (fx) {
    case "KITCHEN_SINK":
      for (const x of [-0.58, 0.58]) box(0.025, 0.8, 0.56, D.woodLight, x, 0.46, 0);
      box(1.17, 0.08, 0.52, D.woodDark, 0, 0.08, 0);
      for (const x of [-0.297, 0.297]) { box(0.586, 0.74, 0.025, D.woodLight, x, 0.49, 0.276); box(0.14, 0.016, 0.025, D.steel, x, 0.7, 0.3); }
      counter(1.22, 0.6, 0.285, 0.205, D.stone, 0.02); bowl(0.285, 0.205, 0.16, 0.907, D.steel, 0, 0.02);
      box(1.22, 0.06, 0.025, D.stone, 0, 0.93, -0.287);
      cyl(0.022, 0.026, 0.06, F.chrome, 0, 0.93, -0.2); cyl(0.013, 0.013, 0.3, F.chrome, 0, 1.08, -0.2);
      tor(0.09, 0.013, F.chrome, 0, 1.23, -0.11, 0, Math.PI / 2, Math.PI);
      spouts = [{ a: V(0, 1.21, -0.02), b: V(0, 0.77, -0.02) }]; top = 1.33; break;
    case "PREP_SINK":
      for (const [x, z] of [[-0.65, -0.3], [0.65, -0.3], [-0.65, 0.3], [0.65, 0.3]]) cyl(0.02, 0.02, 0.86, D.steel, x, 0.43, z);
      counter(1.4, 0.7, 0.39, 0.25, D.steel, 0.03); bowl(0.39, 0.25, 0.22, 0.907, D.steel, 0, 0.03);
      box(1.34, 0.02, 0.62, D.steel, 0, 0.2, 0); box(1.4, 0.18, 0.03, D.steel, 0, 0.99, -0.335);
      cyl(0.015, 0.015, 0.55, F.chrome, 0, 1.17, -0.3); box(0.02, 0.02, 0.25, F.chrome, 0, 1.44, -0.19); cyl(0.012, 0.012, 0.14, F.chrome, 0, 1.37, -0.07);
      spouts = [{ a: V(0, 1.3, -0.07), b: V(0, 0.72, -0.07) }]; top = 1.5; break;
    case "BASIN":
      cyl(0.065, 0.1, 0.69, F.ceramic, 0, 0.345, -0.07);
      bowl(0.255, 0.205, 0.16, 0.86, F.ceramic, 0, 0.02); box(0.34, 0.04, 0.09, F.ceramic, 0, 0.84, -0.175);
      cyl(0.018, 0.02, 0.1, F.chrome, 0, 0.91, -0.16); box(0.02, 0.02, 0.1, F.chrome, 0, 0.95, -0.12);
      spouts = [{ a: V(0, 0.94, -0.07), b: V(0, 0.73, -0.02) }]; top = 1.0; break;
    case "TOILET":
      put(new RoundedBoxGeometry(0.38, 0.36, 0.17, 2, 0.025), F.ceramic, M4(0, 0.6, -0.255));
      put(new RoundedBoxGeometry(0.4, 0.025, 0.185, 2, 0.01), F.ceramic, M4(0, 0.79, -0.255));
      cyl(0.105, 0.14, 0.24, F.ceramic, 0, 0.12, 0.025, 0, 0, 24, 1.3);
      bowl(0.19, 0.25, 0.2, 0.43, F.ceramic, 0, 0.055);
      put(new TorusGeometry(0.155, 0.018, 8, 32), F.ceramic, M4(0, 0.454, 0.055, Math.PI / 2, 0, 0, 1, 1.4, 1));
      cyl(0.025, 0.025, 0.012, F.chrome, 0, 0.785, -0.255); top = 0.85; break;
    case "SHOWER":
      box(0.92, 0.05, 0.92, F.ceramic, 0, 0.025, 0); cyl(0.04, 0.04, 0.006, F.drain, 0, 0.053, 0.1);
      box(0.92, 1.9, 0.012, D.glass, 0, 1, 0.455); box(0.012, 1.9, 0.92, D.glass, 0.455, 1, 0);
      for (const [x, z] of [[-0.45, 0.455], [0.455, 0.455], [0.455, -0.455]]) cyl(0.009, 0.009, 1.93, F.chrome, x, 1.02, z);
      box(0.018, 0.22, 0.025, F.chrome, -0.16, 1.08, 0.48);
      cyl(0.012, 0.012, 1.7, F.chrome, 0, 0.9, -0.44); box(0.02, 0.02, 0.25, F.chrome, 0, 1.74, -0.33); cyl(0.1, 0.1, 0.025, F.chrome, 0, 1.72, -0.21);
      cyl(0.03, 0.03, 0.06, F.chrome, 0, 1.0, -0.43, Math.PI / 2);
      spouts = Array.from({ length: 9 }, (_, k) => { const t = (k / 9) * Math.PI * 2, rr = k === 0 ? 0 : 0.06; return { a: V(Math.cos(t) * rr, 1.7, -0.21 + Math.sin(t) * rr), b: V(Math.cos(t) * rr * 2.6, 0.06, -0.15 + Math.sin(t) * rr * 2.6) }; });
      sensor = V(-0.55, 0.14, -0.4); top = 2.05; break;
    case "TANK":
      box(0.45, 0.62, 0.35, D.white, 0, 0.31, -0.06); bowl(0.29, 0.25, 0.23, 0.865, F.ceramic, 0, 0.015);
      cyl(0.015, 0.015, 0.12, F.chrome, 0, 1.02, -0.22, Math.PI / 2); cyl(0.012, 0.012, 0.05, F.chrome, 0, 1.0, -0.16);
      spouts = [{ a: V(0, 0.975, -0.16), b: V(0, 0.66, -0.08) }]; top = 1.1; break;
    case "WASHER":
      box(0.6, 0.86, 0.6, D.white, 0, 0.43, 0); cyl(0.21, 0.21, 0.012, D.glass, 0, 0.866, 0.03); box(0.6, 0.08, 0.08, D.white, 0, 0.9, -0.26);
      box(0.12, 0.03, 0.01, D.black, 0, 0.91, -0.215); cyl(0.015, 0.015, 0.08, F.chrome, 0.22, 1.0, -0.3, Math.PI / 2);
      for (const x of [-0.22, 0.22]) cyl(0.025, 0.025, 0.008, F.chrome, x, 0.95, -0.25);
      for (let k = 0; k < 5; k++) box(0.13, 0.004, 0.003, F.drain, 0.18, 0.18 + k * 0.022, 0.303);
      for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) cyl(0.025, 0.025, 0.035, D.black, x, 0.018, z);
      top = 1.0; break;
    case "GARDEN_TAP":
      cyl(0.015, 0.015, 0.6, F.bronze, 0, 0.3, -0.06); cyl(0.02, 0.02, 0.08, F.chrome, 0, 0.62, -0.03, Math.PI / 2); box(0.07, 0.012, 0.012, F.chrome, 0, 0.66, -0.03);
      cyl(0.012, 0.012, 0.06, F.chrome, 0, 0.6, 0.01); tor(0.22, 0.022, F.hose, 0.34, 0.03, 0.18, Math.PI / 2);
      spouts = [{ a: V(0, 0.57, 0.015), b: V(0, 0.01, 0.06) }]; top = 0.75; break;
    case "HOSE":
      cyl(0.015, 0.015, 0.6, F.bronze, -0.14, 0.3, -0.07); cyl(0.02, 0.02, 0.08, F.chrome, -0.14, 0.62, -0.04, Math.PI / 2); box(0.07, 0.012, 0.012, F.chrome, -0.14, 0.66, -0.04);
      cyl(0.2, 0.2, 0.1, D.rackOrange, 0.14, 0.55, -0.04, Math.PI / 2); cyl(0.12, 0.12, 0.11, F.hose, 0.14, 0.55, -0.04, Math.PI / 2);
      spouts = [{ a: V(-0.14, 0.58, 0.0), b: V(-0.14, 0.01, 0.07) }]; top = 0.82; break;
    case "DRINKING":
      box(0.34, 0.92, 0.32, D.steel, 0, 0.46, 0); box(0.3, 0.03, 0.26, F.drain, 0, 0.935, 0.01); cyl(0.012, 0.012, 0.05, F.chrome, 0, 0.97, -0.05);
      box(0.06, 0.06, 0.02, D.black, 0.1, 0.8, 0.165);
      spouts = [{ a: V(0, 0.995, -0.05), b: V(0, 0.945, 0.03) }]; top = 1.05; break;
    case "MIXER":
      put(new CylinderGeometry(0.28, 0.42, 0.62, 28, 1, false), F.orange, M4(0, 0.98, 0.05, -0.6)); tor(0.42, 0.03, F.orange, 0, 0.98, 0.05, Math.PI / 2 - 0.6);
      box(0.8, 0.06, 1.0, D.black, 0, 0.55, 0); for (const [x, z] of [[-0.35, -0.4], [0.35, -0.4], [-0.35, 0.4], [0.35, 0.4]]) box(0.06, 0.55, 0.06, D.black, x, 0.27, z);
      for (const x of [-0.46, 0.46]) tor(0.17, 0.05, D.black, x, 0.18, -0.35, 0, Math.PI / 2);
      box(0.25, 0.25, 0.3, D.black, 0.35, 0.72, -0.4); cyl(0.025, 0.025, 1.3, F.bronze, -0.55, 0.65, 0.4); box(0.02, 0.02, 0.22, F.chrome, -0.55, 1.3, 0.5);
      spouts = [{ a: V(-0.55, 1.28, 0.6), b: V(-0.12, 1.12, 0.35) }]; sensor = V(-0.7, 0.14, 0.4); top = 1.45; break;
    case "TAP":
      cyl(0.02, 0.02, 0.7, F.bronze, 0, 0.35, -0.04); cyl(0.02, 0.02, 0.08, F.chrome, 0, 0.7, 0, Math.PI / 2); box(0.07, 0.012, 0.012, F.chrome, 0, 0.74, 0);
      put(new CylinderGeometry(0.15, 0.12, 0.3, 20, 1, true), D.black, M4(0, 0.15, 0.13)); cyl(0.12, 0.12, 0.01, D.black, 0, 0.005, 0.13);
      spouts = [{ a: V(0, 0.68, 0.045), b: V(0, 0.28, 0.12) }]; top = 0.85; break;
    case "HYDROMETER":
      box(0.56, 0.72, 0.06, D.concrete, 0, 0.36, -0.13); for (const x of [-0.18, 0.18]) cyl(0.022, 0.022, 0.5, D.steel, x, 0.25, -0.04);
      cyl(0.022, 0.022, 0.4, D.steel, 0, 0.5, -0.04, 0, Math.PI / 2); cyl(0.07, 0.07, 0.14, D.black, 0, 0.5, -0.04, 0, Math.PI / 2);
      cyl(0.075, 0.075, 0.06, F.bronze, 0, 0.56, -0.04); cyl(0.065, 0.065, 0.012, F.dial, 0, 0.596, -0.04); box(0.08, 0.015, 0.015, F.valveRed, 0.12, 0.56, -0.04);
      sensor = V(0, 0.62, -0.04); top = 0.8; break;
    case "WATER_TANK": {
      const h = floor === 0 && (kind === "HOUSE" || kind === "CONSTRUCTION") ? 1.7 : 0.25;
      for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) box(0.09, h, 0.09, D.concrete, x, h / 2, z);
      box(1.45, 0.08, 1.45, D.concrete, 0, h + 0.04, 0);
      if (h > 1) {
        for (const z of [-0.6, 0.6]) {
          box(1.29, 0.1, 0.1, D.concrete, 0, 0.2, z);
          box(0.06, Math.hypot(1.2, h - 0.4), 0.06, D.steel, 0, h / 2, z, 0, 0, Math.atan2(1.2, h - 0.4));
        }
      }
      put(new CylinderGeometry(0.62, 0.5, 0.82, 40), F.tankBlue, M4(0, h + 0.49, 0)); cyl(0.66, 0.66, 0.06, F.tankLid, 0, h + 0.93, 0, 0, 0, 40); cyl(0.2, 0.2, 0.05, F.tankLid, 0, h + 0.98, 0);
      for (const yy of [0.18, 0.36, 0.57, 0.76]) tor(0.5 + yy * 0.14, 0.012, F.tankBlue, 0, h + yy, 0, Math.PI / 2);
      cyl(0.025, 0.025, h + 0.12, D.steel, 0.3, (h + 0.12) / 2, 0.45);
      sensor = V(0.5, h + 0.5, 0.45); top = h + 1.1; break;
    }
    default: // MANIFOLD
      box(0.08, 0.45, 0.08, D.concrete, 0, 0.225, -0.05); cyl(0.025, 0.025, 0.5, D.steel, 0, 0.45, -0.05, 0, Math.PI / 2);
      box(0.07, 0.02, 0.02, F.valveRed, -0.12, 0.5, -0.05); box(0.07, 0.02, 0.02, F.valveBlue, 0.12, 0.5, -0.05); top = 0.65;
  }
  // O obstáculo inclui mangueira/balde à frente; mantém o montante preso à parede quando a pegada aumenta.
  const originalBack = fx === "GARDEN_TAP" || fx === "TAP" ? 0.08 : fx === "HOSE" ? 0.11 : null;
  if (originalBack !== null) {
    const dz = originalBack - d / 2, translate = new Matrix4().makeTranslation(0, 0, dz);
    for (const part of parts) part.m.premultiply(translate);
    sensor.z += dz;
    for (const sp of spouts) { sp.a.z += dz; sp.b.z += dz; }
  }
  return { parts, top, spouts, sensor };
}

