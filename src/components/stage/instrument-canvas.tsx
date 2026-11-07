"use client";
import { useEffect, useRef } from "react";
import { twinCapability, type TwinReason } from "./stage-logic";
import type { InstrumentState } from "./instrument-state";
import { probeWebGL } from "./three/webgl-probe";
import { createInstrumentScene, type InstrumentScene, type InstrumentStats } from "./three/instrument-scene";
import type { InstrumentKind } from "./three/instrument-models";

export default function InstrumentCanvas(props: { kind: InstrumentKind; input: InstrumentState; onReady(): void; onFail(reason: TwinReason): void; onStats(stats: InstrumentStats): void }) {
  const host = useRef<HTMLDivElement>(null), scene = useRef<InstrumentScene | null>(null), latest = useRef(props);
  useEffect(() => { latest.current = props; });
  useEffect(() => {
    if (!host.current) return;
    let alive = true;
    const fail = (reason: TwinReason) => { if (alive) latest.current.onFail(reason); };
    const capability = twinCapability({ ...probeWebGL(), flag: true, reduced: false });
    if (capability !== "ok") { queueMicrotask(() => fail(capability)); return () => { alive = false; }; }
    let instance: InstrumentScene;
    try { instance = createInstrumentScene(host.current, latest.current.kind, { onFail: fail, onStats: stats => { if (alive) latest.current.onStats(stats); } }); }
    catch { queueMicrotask(() => fail("error")); return () => { alive = false; }; }
    scene.current = instance; instance.update(latest.current.input);
    instance.ready.then(() => { if (alive) latest.current.onReady(); }, () => fail("error"));
    return () => { alive = false; scene.current = null; instance.dispose(); };
  }, []);
  const { fresh, simulated, fraction, tone, confirmed, total } = props.input;
  useEffect(() => { scene.current?.update({ fresh, simulated, fraction, tone, confirmed, total }); }, [fresh, simulated, fraction, tone, confirmed, total]);
  return <div className="instrument-canvas" ref={host} />;
}
