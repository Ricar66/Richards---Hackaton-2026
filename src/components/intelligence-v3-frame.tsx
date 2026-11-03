"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { OverviewDTO } from "@/modules/analytics/domain/types";
import { timeBR } from "@/lib/format";

/**
 * BI experience lab: the new exploratory shell talks to the existing Next.js API.
 * The presentation is an isolated self-contained HTML prototype. Source provenance
 * is preserved; unsupported filters are disabled after connecting to the backend.
 * Operational writes remain in the main app until they are deliberately migrated.
 */
export function IntelligenceV3Frame({ initialData }: { initialData: OverviewDTO }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [dataset, setDataset] = useState(initialData);
  // Polling falhou: o iframe mantém o último snapshot real, mas isso precisa ficar visível.
  const [staleSince, setStaleSince] = useState<string | null>(null);
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
        if (!response.ok) throw new Error(String(response.status));
        const result = (await response.json()) as OverviewDTO;
        if (active) { setDataset(result); setStaleSince(null); }
      } catch {
        if (active) setStaleSince(prev => prev ?? timeBR());
      }
    }, 15000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  return (
    <>
      {staleSince && (
        <div className="stale-banner" role="status" style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 10, maxWidth: "calc(100% - 32px)", boxShadow: "0 8px 24px #0002" }}>
          Sem conexão com o servidor desde {staleSince}. Os números exibidos não estão sendo atualizados.
        </div>
      )}
      <Link className="legacy-back" href="/">← Voltar ao BI</Link>
      <iframe
        ref={frame}
        src="/richards-bi-v3.html"
        title="RICHARDS Intelligence — BI investigativo experimental"
        onLoad={() => pushToFrame(dataset)}
        style={{ display: "block", width: "100%", height: "100dvh", border: 0 }}
      />
    </>
  );
}
