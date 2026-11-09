import { Box3, PerspectiveCamera, Vector3 } from "three";

export type CameraPreset = "inspection" | "volume" | "top";
/** Enquadra os pontos visíveis reservando espaço para comandos e rótulos. A mesma conta vale no resize;
 * trocar desktop por retrato não pode manter a distância calculada para a largura antiga. */
export function fitCamera(points: Vector3[], aspect: number, preset: CameraPreset, stacked: boolean, fov = 32, inset?: { top: number; height: number }) {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const pts = points.length ? points : [new Vector3(-1, 0, -1), new Vector3(1, 1, 1)];
  const camera = new PerspectiveCamera(fov, safeAspect, 0.01, 10000);
  const elevation = preset === "top" ? 1.555 : preset === "volume" ? 0.62 : stacked ? 0.56 : 1.02;
  const azimuth = preset === "top" ? 0 : -0.58;
  const direction = new Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation));
  const forward = direction.clone().negate();
  const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize();
  const up = new Vector3().crossVectors(right, forward);
  const tanV = Math.tan(fov * Math.PI / 360), tanH = tanV * safeAspect;
  const limits = { top: safeAspect < 1.2 ? 0.58 : 0.78, bottom: 0.92, side: 0.88 };
  if (inset && inset.height > 0) limits.top = Math.min(limits.top, 1 - 2 * Math.min(inset.height * 0.44, Math.max(0, inset.top) + 12) / inset.height);
  const target = new Box3().setFromPoints(pts).getCenter(new Vector3());
  let distance = 1;
  for (let k = 0; k < 8; k++) {
    distance = 1;
    for (const p of pts) {
      const v = p.clone().sub(target), along = v.dot(forward), sy = v.dot(up);
      distance = Math.max(distance, Math.abs(v.dot(right)) / (tanH * limits.side) - along,
        (sy > 0 ? sy / (tanV * limits.top) : -sy / (tanV * limits.bottom)) - along);
    }
    camera.position.copy(target).addScaledVector(direction, distance); camera.lookAt(target); camera.updateMatrixWorld();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { const s = p.clone().project(camera); x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y); }
    target.addScaledVector(right, (x0 + x1) / 2 * tanH * distance).addScaledVector(up, ((y0 + y1) / 2 - (limits.top - limits.bottom) / 2) * tanV * distance);
  }
  // A última recentralização também precisa passar pela restrição de enquadramento.
  for (const p of pts) {
    const v = p.clone().sub(target), along = v.dot(forward), sy = v.dot(up);
    distance = Math.max(distance, Math.abs(v.dot(right)) / (tanH * limits.side) - along,
      (sy > 0 ? sy / (tanV * limits.top) : -sy / (tanV * limits.bottom)) - along);
  }
  return { target, position: target.clone().addScaledVector(direction, distance), distance, limits };
}
