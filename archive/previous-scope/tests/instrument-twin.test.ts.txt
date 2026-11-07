import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Box3, Mesh, Vector3 } from "three";
import { createInstrumentModel } from "../src/components/stage/three/instrument-models";
import { scaleInstrument, temperatureInstrument } from "../src/components/stage/instrument-state";
import { scaleView, temperatureView, type ScaleLive, type TemperatureLive } from "../src/components/stage/stage-logic";
import { ScalePanel, TemperaturePanel } from "../src/components/stage/sensors";
import { InstrumentTwin } from "../src/components/stage/instrument-twin";
import { ThermalGlyph } from "../src/components/stage/thermal-glyph";

const now = Date.parse("2026-11-07T17:00:00Z");
const scale: ScaleLive = { at: now, deviceId: "qa", deviceCode: "QA-SIM", kg: 3, source: "SIMULATED", channel: "bancada-virtual", progress: { phase: "stabilizing", minKg: 1.5, stableSeconds: 2, requiredSeconds: 6 } };
const temperature: TemperatureLive = { at: now, deviceId: "qa", deviceCode: "QA-SIM", c: 32, humidityPct: 60, source: "SIMULATED", channel: "bancada-virtual", rule: { limitC: 30, continuousSeconds: 20, observedSeconds: 2, suspicious: false } };

test("instrumentos: frações e estabilidade só vêm da view da leitura; relógio não avança estabilidade", () => {
  const initial = scaleInstrument(scale, scaleView(scale, null, now));
  const later = scaleInstrument(scale, scaleView(scale, null, now + 1000));
  assert.deepEqual(later, initial);
  assert.equal(initial.confirmed, 2); assert.equal(initial.total, 6); assert.equal(initial.simulated, true);
  assert.equal(temperatureInstrument(temperature, temperatureView(temperature, now)).tone, "warn");
  assert.equal(temperatureInstrument({ ...temperature, rule: { ...temperature.rule, suspicious: true } }, { ...temperatureView(temperature, now), state: "sustentado" }).tone, "danger");
  assert.match(renderToStaticMarkup(createElement(ThermalGlyph, { fraction: 0.8, fresh: true, simulated: false, tone: "danger" })), /#ec6b64/, "o fallback também respeita o estado de alerta");
});

test("instrumentos: perda de atualidade limpa carga/coluna, preserva origem e não transforma ausência em leitura zero", () => {
  const staleScale = scaleInstrument(scale, scaleView(scale, null, now + 120000));
  const staleTemp = temperatureInstrument(temperature, temperatureView(temperature, now + 120000));
  assert.equal(staleScale.fresh, false); assert.equal(staleScale.fraction, 0); assert.equal(staleScale.confirmed, 0); assert.equal(staleScale.simulated, true);
  assert.equal(staleTemp.fresh, false); assert.equal(staleTemp.fraction, 0);
  assert.equal(scaleInstrument(null, null).fresh, false);
  const zero = { ...scale, kg: 0 }; const v = scaleInstrument(zero, scaleView(zero, null, now));
  assert.equal(v.fresh, true); assert.equal(v.fraction, 0);
  assert.equal(scaleInstrument({ ...scale, kg: Number.NaN }, scaleView(scale, null, now)).fresh, false);
});

test("painéis sem dado mantêm representação acessível e nenhum número fictício, mesmo com 3D solicitado", () => {
  const html = renderToStaticMarkup(createElement(TemperaturePanel, { t: null, view: null, occurrence: null, nowMs: now, want3d: true }));
  assert.match(html, /aguardando leitura/); assert.match(html, /sem leitura recente/); assert.match(html, /role="img"/);
  assert.doesNotMatch(html, /0,0/); assert.doesNotMatch(html, /<canvas/);
  const scaleHtml = renderToStaticMarkup(createElement(ScalePanel, { s: scale, view: scaleView(scale, null, now + 120000), nowMs: now, want3d: false }));
  assert.match(scaleHtml, /último valor/); assert.match(scaleHtml, /SIMULADO/); assert.match(scaleHtml, /carga ilustrativa/);
});

test("movimento reduzido mantém fallback e impede montagem 3D dos instrumentos", () => {
  const html = renderToStaticMarkup(createElement(InstrumentTwin, { kind: "scale", input: scaleInstrument(scale, scaleView(scale, null, now)), enabled: true, reduced: true, label: "ensaio" }, createElement("svg")));
  assert.match(html, /data-instrument-mode="svg"/); assert.match(html, /data-instrument-reason="reduced"/); assert.doesNotMatch(html, /instrument-canvas/);
});

for (const kind of ["scale", "temperature"] as const) test(`${kind}: malhas reais finitas, custo limitado, atualizações discretas e descarte único`, () => {
  const model = createInstrumentModel(kind);
  let calls = 0, triangles = 0;
  const resources = new Set<{ addEventListener(type: "dispose", listener: () => void): void }>();
  model.root.traverse(o => {
    if (!(o instanceof Mesh)) return;
    calls++; triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite));
    resources.add(o.geometry); for (const mat of Array.isArray(o.material) ? o.material : [o.material]) resources.add(mat);
  });
  assert.ok(calls < 75, `calls ${calls}`); assert.ok(triangles < 20000, `triangles ${triangles}`);
  const size = new Box3().setFromObject(model.root).getSize(new Vector3());
  assert.ok(size.x < 5 && size.y < 4 && size.z < 4);
  const input = scaleInstrument(scale, scaleView(scale, null, now)); model.apply(input);
  const snapshot = () => { const poses: unknown[] = []; model.root.traverse(o => poses.push([o.visible, ...o.position.toArray(), ...o.scale.toArray()])); return poses; };
  const poses = snapshot(); model.apply(input); assert.deepEqual(snapshot(), poses, "mesmo dado não acumula posição ou avança nada");
  model.apply({ ...input, fresh: false, fraction: 0, confirmed: 0 }); assert.notDeepEqual(snapshot(), poses, "dado velho não deixa carga/coluna ativa");
  let disposals = 0; for (const resource of resources) resource.addEventListener("dispose", () => { disposals++; });
  model.dispose(); assert.equal(disposals, resources.size);
});
