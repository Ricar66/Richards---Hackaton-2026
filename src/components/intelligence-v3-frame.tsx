"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OverviewDTO } from "@/modules/analytics/domain/types";

/**
 * BI experience lab: the new exploratory shell talks to the existing Next.js API.
 * The presentation is an isolated self-contained HTML prototype. Source provenance
 * is preserved; unsupported filters are disabled after connecting to the backend.
 * Operational writes remain in the main app until they are deliberately migrated.
 */
export function IntelligenceV3Frame({ initialData }: { initialData: OverviewDTO }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [dataset, setDataset] = useState(initialData);
  const pushToFrame = useCallback((data: OverviewDTO) => {
    if (!frame.current?.contentWindow) return;
    frame.current.contentWindow.postMessage(
      { type: "RICHARDS_SYNC", payload: data },
      window.location.origin,
    );
  }, []);

  useEffect(() => { pushToFrame(dataset); }, [dataset, pushToFrame]);
  useEffect(() => {
    let active = true;
    const interval = window.setInterval(async () => {
      try {
        const response = await fetch("/api/analytics/overview", { cache: "no-store" });
        if (!response.ok) return;
        const result = (await response.json()) as OverviewDTO;
        if (active) setDataset(result);
      } catch { /* keep last successful snapshot */ }
    }, 15000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  return (
    <iframe
      ref={frame}
      src="/richards-bi-v3.html"
      title="RICHARDS Intelligence — BI investigativo experimental"
      onLoad={() => pushToFrame(dataset)}
      style={{ display: "block", width: "100%", height: "100dvh", border: 0 }}
    />
  );
}
