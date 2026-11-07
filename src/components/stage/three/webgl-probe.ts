import type { TwinProbe } from "../stage-logic";

/** Mesma sonda usada pelo cano e pelos instrumentos. Contextos de teste descartados imediatamente. */
export function probeWebGL(): TwinProbe {
  try {
    const a = document.createElement("canvas").getContext("webgl2");
    if (!a) return { webgl2: false, caveatOk: false, renderer: null };
    const info = a.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(info ? a.getParameter(info.UNMASKED_RENDERER_WEBGL) : a.getParameter(a.RENDERER));
    a.getExtension("WEBGL_lose_context")?.loseContext();
    const b = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    b?.getExtension("WEBGL_lose_context")?.loseContext();
    return { webgl2: true, caveatOk: !!b, renderer };
  } catch { return { webgl2: false, caveatOk: false, renderer: null }; }
}
