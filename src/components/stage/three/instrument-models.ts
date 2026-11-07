import {
  BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { InstrumentState } from "../instrument-state";

export type InstrumentKind = "scale" | "temperature";
export type InstrumentModel = { root: Group; apply(input: InstrumentState): void; dispose(): void };
const TONE = { ok: "#3fd0a7", warn: "#f2a94a", danger: "#ec6b64" };

/** Malhas pequenas, materiais compartilhados, sem sombras dinâmicas, texturas/CDN ou animação autônoma. */
export function createInstrumentModel(kind: InstrumentKind): InstrumentModel {
  const root = new Group();
  root.name = `instrument-${kind}`;
  const steel = new MeshStandardMaterial({ color: "#a0b5bc", metalness: 0.78, roughness: 0.3 });
  const dark = new MeshStandardMaterial({ color: "#1e333d", metalness: 0.45, roughness: 0.38 });
  const accent = new MeshStandardMaterial({ color: "#4c626c", metalness: 0.2, roughness: 0.4 });
  const signal = new MeshStandardMaterial({ color: "#32474d", emissive: "#000000", roughness: 0.35 });
  const make = (geometry: Mesh["geometry"], material: Mesh["material"], x: number, y: number, z: number, parent = root) => {
    const mesh = new Mesh(geometry, material); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  };
  const load = new Group(), bars: Mesh[] = [];
  let column: Mesh | null = null;
  if (kind === "scale") {
    // Balança industrial com prato metálico, pés, moldura e carga apenas ilustrativa.
    make(new RoundedBoxGeometry(3.7, 0.42, 2.7, 2, 0.12), dark, 0, -1.15, 0);
    make(new RoundedBoxGeometry(3.85, 0.13, 2.8, 2, 0.06), steel, 0, -0.88, 0);
    const footGeo = new CylinderGeometry(0.18, 0.22, 0.2, 12);
    for (const x of [-1.45, 1.45]) for (const z of [-0.95, 0.95]) make(footGeo, dark, x, -1.44, z);
    make(new BoxGeometry(1.3, 0.22, 0.06), accent, 0, -1.14, 1.39);
    const barGeo = new BoxGeometry(0.12, 0.09, 0.035);
    for (let i = 0; i < 12; i++) {
      const bar = make(barGeo, signal, -0.55 + i * 0.1, -1.14, 1.43); bars.push(bar);
    }
    const wood = new MeshStandardMaterial({ color: "#98643c", roughness: 0.8, metalness: 0 });
    const woodEdge = new MeshStandardMaterial({ color: "#c0935f", roughness: 0.7 });
    make(new BoxGeometry(2.9, 0.1, 2.05), wood, 0, -0.7, 0);
    const slatGeo = new BoxGeometry(2.95, 0.16, 0.1);
    for (const z of [-1, 1]) for (const y of [-0.55, -0.3, -0.05]) make(slatGeo, wood, 0, y, z);
    const sideGeo = new BoxGeometry(0.1, 0.16, 2.05);
    for (const x of [-1.45, 1.45]) for (const y of [-0.55, -0.3, -0.05]) make(sideGeo, woodEdge, x, y, 0);
    const postGeo = new BoxGeometry(0.12, 0.8, 0.12);
    for (const x of [-1.36, 1.36]) for (const z of [-0.92, 0.92]) make(postGeo, woodEdge, x, -0.35, z);
    const fruitGeo = new SphereGeometry(0.32, 16, 12);
    const fruitMaterials = ["#be5b3c", "#91ad4c", "#d7b956"].map(color => new MeshStandardMaterial({ color, roughness: 0.42, metalness: 0 }));
    const stemGeo = new CylinderGeometry(0.025, 0.035, 0.15, 6);
    for (let i = 0; i < 12; i++) {
      const fruit = new Group();
      fruit.position.set((i % 4 - 1.5) * 0.64, -0.32 + (i > 7 ? 0.39 : 0), (Math.floor(i / 4) % 2 - 0.5) * 0.72);
      const apple = make(fruitGeo, fruitMaterials[i % 3], 0, 0, 0, fruit); apple.scale.y = 0.88;
      make(stemGeo, wood, 0, 0.3, 0, fruit);
      load.add(fruit);
    }
    root.add(load);
  } else {
    // Instrumento térmico esquemático: a coluna é escala visual, não mercúrio nem nível medido.
    make(new RoundedBoxGeometry(1.65, 3.45, 0.35, 2, 0.14), dark, 0, 0, 0);
    make(new RoundedBoxGeometry(1.5, 3.3, 0.13, 2, 0.12), steel, 0, 0.02, 0.2);
    make(new RoundedBoxGeometry(0.5, 2.75, 0.08, 2, 0.09), dark, 0.22, 0.1, 0.3);
    const screwGeo = new CylinderGeometry(0.065, 0.065, 0.035, 10);
    for (const x of [-0.59, 0.59]) for (const y of [-1.4, 1.4]) { const screw = make(screwGeo, dark, x, y, 0.29); screw.rotation.x = Math.PI / 2; }
    column = make(new CylinderGeometry(0.11, 0.11, 2.3, 16), signal, 0.22, -1.05, 0.38);
    make(new SphereGeometry(0.22, 16, 12), signal, 0.22, -1.15, 0.38);
    const rim = make(new TorusGeometry(0.27, 0.04, 8, 24), accent, 0.22, -1.15, 0.37); rim.rotation.y = 0;
    const tickGeo = new BoxGeometry(0.19, 0.025, 0.04);
    for (let i = 0; i <= 10; i++) make(tickGeo, dark, -0.22, -0.9 + i * 0.2, 0.31);
    const blue = new MeshStandardMaterial({ color: "#377da5", roughness: 0.62 });
    make(new RoundedBoxGeometry(0.45, 0.76, 0.23, 2, 0.04), blue, -0.43, -0.75, 0.39);
    const ventGeo = new BoxGeometry(0.32, 0.04, 0.02);
    for (let i = 0; i < 5; i++) make(ventGeo, dark, -0.43, -0.99 + i * 0.12, 0.52);
  }
  return {
    root,
    apply(input) {
      const fraction = Number.isFinite(input.fraction) ? Math.max(0, Math.min(1, input.fraction)) : 0;
      const color = input.fresh ? TONE[input.tone] : "#40535d";
      accent.color.set(input.simulated ? "#b6a3e2" : color);
      signal.color.set(color); signal.emissive.set(input.fresh ? color : "#000000"); signal.emissiveIntensity = input.fresh ? 0.15 : 0;
      const shown = input.fresh ? Math.round(fraction * load.children.length) : 0;
      load.children.forEach((fruit, i) => { fruit.visible = i < shown; });
      const lit = input.fresh && input.total > 0 ? Math.floor(Math.min(1, Math.max(0, input.confirmed / input.total)) * bars.length) : 0;
      bars.forEach((bar, i) => { bar.visible = i < lit; });
      if (column) { column.visible = input.fresh && fraction > 0; column.scale.y = Math.max(0.001, fraction); column.position.y = -1.05 + fraction * 1.15; }
    },
    dispose() {
      const resources = new Set<{ dispose(): void }>();
      root.traverse(o => { if (o instanceof Mesh) { resources.add(o.geometry); for (const mat of Array.isArray(o.material) ? o.material : [o.material]) resources.add(mat); } });
      for (const resource of resources) resource.dispose();
    },
  };
}
