import test from "node:test";
import assert from "node:assert/strict";
import { Box3, InstancedMesh, Matrix4, Mesh, Vector3 } from "three";
import { createIndustrialAssembly } from "../src/components/stage/three/industrial-assembly";

test("montagem industrial mantém 48 parafusos em uma instância e geometria finita dentro do enquadramento", () => {
  const { group, details } = createIndustrialAssembly();
  const bolts = group.getObjectByName("48-flange-bolts") as InstancedMesh;
  assert.equal(bolts.isInstancedMesh, true);
  assert.equal(bolts.count, 48);
  const matrix = new Matrix4();
  for (let i = 0; i < bolts.count; i++) {
    bolts.getMatrixAt(i, matrix);
    assert.ok(matrix.elements.every(Number.isFinite));
    assert.ok(Math.abs(matrix.elements[12]) <= 4.33);
  }
  const box = new Box3().setFromObject(group), size = box.getSize(new Vector3());
  assert.ok(size.x <= 13.6 && size.x > 13);
  assert.ok(size.y < 4 && size.z <= 3.2);
  let calls = 0, triangles = 0;
  group.traverse(o => {
    if (!(o instanceof Mesh)) return;
    calls++;
    const geometry = o.geometry;
    triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3 * (o instanceof InstancedMesh ? o.count : 1);
    assert.ok([...geometry.attributes.position.array].every(Number.isFinite));
  });
  assert.ok(calls <= 32, `montagem adiciona ${calls} chamadas`);
  assert.ok(triangles < 20000, `${triangles} triângulos na montagem`);
  assert.ok(details.children.includes(bolts), "DPR adaptativo remove os detalhes opcionais juntos");
  const resources = new Set<{ dispose(): void }>();
  group.traverse(o => { if (o instanceof Mesh) { resources.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) resources.add(m); if (o instanceof InstancedMesh) resources.add(o); } });
  for (const resource of resources) resource.dispose();
});
