import {
  BoxGeometry, CatmullRomCurve3, CylinderGeometry, Group, InstancedMesh, LatheGeometry, Mesh,
  MeshStandardMaterial, Object3D, TorusGeometry, TubeGeometry, Vector2, Vector3,
} from "three";

/** Detalhe mecânico esquemático, não réplica dimensional do hardware da bancada.
 * Repetições em instâncias: 48 parafusos em UMA chamada, sem sombra dinâmica ou assets externos. */
export function createIndustrialAssembly() {
  const group = new Group();
  group.name = "industrial-assembly";
  const steel = new MeshStandardMaterial({ color: "#93aeb6", metalness: 0.88, roughness: 0.27, envMapIntensity: 1.35 });
  const graphite = new MeshStandardMaterial({ color: "#24373f", metalness: 0.72, roughness: 0.4 });
  const rubber = new MeshStandardMaterial({ color: "#111b20", metalness: 0, roughness: 0.8 });
  const chrome = new MeshStandardMaterial({ color: "#c6d1d3", metalness: 0.96, roughness: 0.19 });
  const details = new Group();
  details.name = "optional-mechanical-detail";
  group.add(details);

  const plate = new Mesh(new BoxGeometry(13.5, 0.12, 3.1), graphite);
  plate.position.y = -1.86;
  group.add(plate);
  const railGeo = new BoxGeometry(12.9, 0.06, 0.09);
  for (const z of [-1.35, 1.35]) {
    const rail = new Mesh(railGeo, steel);
    rail.position.set(0, -1.76, z);
    details.add(rail);
  }

  // Mangas metálicas nos cotovelos. Janela central transparente continua mostrando a água.
  const elbow = new CatmullRomCurve3([
    new Vector3(-6, -1.95, 0), new Vector3(-5.85, -0.9, 0),
    new Vector3(-5.2, -0.08, 0), new Vector3(-4.2, 0, 0),
  ], false, "centripetal");
  const elbowGeo = new TubeGeometry(elbow, 44, 0.635, 32, false);
  const left = new Mesh(elbowGeo, steel);
  group.add(left);
  const right = new Mesh(elbowGeo, steel);
  right.rotation.y = Math.PI;
  group.add(right);

  // Perfil anular: o flange tem um furo real, sem tampa sólida atravessando a água.
  const flangeGeo = new LatheGeometry([
    new Vector2(0.625, -0.08), new Vector2(0.81, -0.08), new Vector2(0.81, 0.08),
    new Vector2(0.625, 0.08), new Vector2(0.625, -0.08),
  ], 48);
  const gasketGeo = new TorusGeometry(0.67, 0.045, 8, 48);
  const lipGeo = new TorusGeometry(0.7, 0.025, 8, 48);
  const flangeXs = [-4.2, -2.1, 2.1, 4.2];
  for (const x of flangeXs) {
    const flange = new Mesh(flangeGeo, steel);
    flange.rotation.z = Math.PI / 2;
    flange.position.x = x;
    group.add(flange);
    const gasket = new Mesh(gasketGeo, rubber);
    gasket.rotation.y = Math.PI / 2;
    gasket.position.x = x + 0.1;
    details.add(gasket);
    const lip = new Mesh(lipGeo, chrome);
    lip.rotation.y = Math.PI / 2;
    lip.position.x = x - 0.1;
    details.add(lip);
  }

  const bolts = new InstancedMesh(new CylinderGeometry(0.065, 0.065, 0.09, 6), chrome, 48);
  bolts.name = "48-flange-bolts";
  const dummy = new Object3D();
  let index = 0;
  for (const x of flangeXs) for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    dummy.position.set(x + side * 0.12, Math.cos(angle) * 0.72, Math.sin(angle) * 0.72);
    dummy.rotation.set(0, 0, Math.PI / 2);
    dummy.updateMatrix();
    bolts.setMatrixAt(index++, dummy.matrix);
  }
  bolts.instanceMatrix.needsUpdate = true;
  bolts.computeBoundingSphere();
  details.add(bolts);

  // Apoios e tirantes: o conjunto deixa de parecer uma mangueira flutuante.
  const footGeo = new BoxGeometry(0.8, 0.12, 1.8);
  const stemGeo = new BoxGeometry(0.3, 0.86, 0.45);
  const saddleGeo = new TorusGeometry(0.67, 0.075, 8, 32, Math.PI);
  for (const x of [-3.25, 3.25]) {
    const foot = new Mesh(footGeo, steel);
    foot.position.set(x, -1.72, 0);
    group.add(foot);
    const stem = new Mesh(stemGeo, graphite);
    stem.position.set(x, -1.22, 0);
    group.add(stem);
    const saddle = new Mesh(saddleGeo, graphite);
    saddle.rotation.set(0, Math.PI / 2, Math.PI);
    saddle.position.set(x, 0, 0);
    group.add(saddle);
  }

  const wire = new CatmullRomCurve3([
    new Vector3(0.58, 1.15, -0.25), new Vector3(1.1, 1.24, -0.45),
    new Vector3(1.4, 0.8, -0.65), new Vector3(1.6, -1.65, -0.9), new Vector3(3.6, -1.72, -1),
  ]);
  details.add(new Mesh(new TubeGeometry(wire, 32, 0.035, 6, false), rubber));

  return { group, details };
}
