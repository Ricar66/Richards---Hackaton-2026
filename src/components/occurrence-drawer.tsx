"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Eye, X, XCircle } from "lucide-react";
import type { OccurrenceDTO } from "@/modules/analytics/domain/types";
import type { OccurrenceDetailDTO } from "@/modules/monitoring/application/get-occurrence-detail";
import { dateBR, numBR, timeBR } from "@/lib/format";

const actionLabel: Record<string, string> = { CREATED: "Ocorrência aberta", ACKNOWLEDGED: "Investigação assumida (ACK)", RESOLVED: "Resolvida", DISMISSED: "Descartada" };
const statusLabel: Record<string, string> = { OPEN: "Aberta", ACKNOWLEDGED: "Em análise", RESOLVED: "Resolvida", DISMISSED: "Descartada" };
const sourceLabel: Record<string, string> = { DEVICE: "SENSOR (DEVICE)", SIMULATED: "SIMULAÇÃO (SIMULATED)", MANUAL: "MANUAL" };
const connectivityLabel: Record<string, string> = { ONLINE: "comunicando", OFFLINE: "sem comunicação", NEVER_SEEN: "nunca comunicou", MAINTENANCE: "em manutenção" };
const VISIBLE_READINGS = 12;

async function fetchDetail(id: string): Promise<{ ok: true; detail: OccurrenceDetailDTO } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/occurrences/${encodeURIComponent(id)}`, { cache: "no-store" });
    const body = await res.json();
    return res.ok ? { ok: true, detail: body as OccurrenceDetailDTO } : { ok: false, error: body.error || "Falha ao carregar a ocorrência" };
  } catch { return { ok: false, error: "Sem conexão com o servidor" }; }
}

/** Evidência e ações vêm sempre do servidor: nada de timeline ilustrativa nem estado alterado só no navegador. */
export function OccurrenceDrawer({ occurrence, onClose, onChanged }: { occurrence: OccurrenceDTO; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<OccurrenceDetailDTO | null>(null);
  const [loadError, setLoadError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  // `version` muda após cada ação para recarregar a timeline confirmada pelo servidor.
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    fetchDetail(occurrence.id).then(r => {
      if (!alive) return;
      if (r.ok) { setDetail(r.detail); setLoadError(""); } else setLoadError(r.error);
    });
    return () => { alive = false; };
  }, [occurrence.id, version]);

  // Teclado: foco entra no painel, Escape fecha e o foco volta para quem abriu (T28).
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); opener?.focus(); };
  }, []);

  async function act(status: "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED") {
    setBusy(true); setActionError("");
    try {
      const res = await fetch(`/api/occurrences/${encodeURIComponent(occurrence.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, note: note.trim() }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Operação recusada");
      setNote(""); setVersion(v => v + 1); onChanged();
    } catch (e) { setActionError(e instanceof Error ? e.message : "Falha na operação"); }
    finally { setBusy(false); }
  }

  const d = detail;
  const status = d?.status ?? occurrence.status;
  const active = status === "OPEN" || status === "ACKNOWLEDGED";
  const noteOk = note.trim().length >= 5;
  const ev = d?.evidence;
  const lastFollow = ev?.followUp[ev.followUp.length - 1];
  return <div className="drawer-backdrop show" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="occ-title" tabIndex={-1} ref={panel}>
      <button className="drawer-close" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
      <div className="kicker" style={{ color: "#189a74" }}>DETALHE DA OCORRÊNCIA · {sourceLabel[occurrence.source] ?? occurrence.source}</div>
      <h2 id="occ-title">{occurrence.title}</h2>
      <div className="subtext">{occurrence.description}</div>
      {loadError && <p role="alert" className="drawer-error">{loadError}</p>}
      {!d && !loadError && <p className="subtext" role="status">Carregando evidências…</p>}
      {d && <>
        <div style={{ marginTop: 14 }}>
          <div className="data-row"><span>Status</span><strong>{statusLabel[d.status] ?? d.status}</strong></div>
          <div className="data-row"><span>Sensor</span><strong>{d.device ? `${d.device.code} · ${connectivityLabel[d.device.connectivity]}` : "—"}</strong></div>
          <div className="data-row"><span>Volume na janela (suspeito)</span><strong>{d.suspectedLiters !== null ? `${numBR(d.suspectedLiters, 2)} L` : "—"}</strong></div>
          <div className="data-row"><span>Aberta em</span><strong>{dateBR(d.openedAt)}</strong></div>
        </div>

        <h3 className="drawer-section">Evidência</h3>
        <p className="subtext">{d.evidenceNote}</p>
        {ev && <>
          <div className="data-row"><span>Janela avaliada</span><strong>{timeBR(new Date(ev.windowStart))} – {timeBR(new Date(ev.windowEnd))}</strong></div>
          <div className="data-row"><span>Regra</span><strong>{ev.rule ? `≥ ${numBR(ev.rule.minFlowLpm, 2)} L/min por ${ev.rule.continuousSeconds} s` : "—"}</strong></div>
          <div className="data-row"><span>Amostras · volume · pico</span><strong>{ev.totals.samples} · {numBR(ev.totals.liters, 3)} L · {numBR(ev.totals.maxFlowLpm, 2)} L/min</strong></div>
          <table className="evidence-table">
            <caption className="sr-only">Leituras da janela que abriu o alerta</caption>
            <thead><tr><th scope="col">Hora</th><th scope="col">Vazão (L/min)</th><th scope="col">Volume (L)</th><th scope="col">Seq.</th></tr></thead>
            <tbody>{ev.readings.slice(-VISIBLE_READINGS).map(r => <tr key={`${r.bootId}:${r.sequence}`}><td>{timeBR(new Date(r.at))}</td><td>{numBR(r.flowLpm, 2)}</td><td>{numBR(r.deltaLiters, 3)}</td><td>{r.sequence}</td></tr>)}</tbody>
          </table>
          {ev.readings.length > VISIBLE_READINGS && <p className="subtext">Mostrando as {VISIBLE_READINGS} últimas de {ev.readings.length} leituras.</p>}
          <p className="subtext">Depois da abertura{d.resolvedAt ? " (até o encerramento)" : ""}: {ev.followUp.length} leitura(s){lastFollow ? `; a última, às ${timeBR(new Date(lastFollow.at))}, marcou ${numBR(lastFollow.flowLpm, 2)} L/min` : ""}.</p>
        </>}

        <h3 className="drawer-section">Linha do tempo</h3>
        {d.timeline.length
          ? <div className="timeline" style={{ marginTop: 10 }}>{d.timeline.map((e, i) => <div className="tl" key={i}><b>{actionLabel[e.action] ?? e.action}</b><span>{dateBR(e.at)} · {e.actor ?? "autor não registrado"}{e.note ? ` — ${e.note}` : ""}</span></div>)}</div>
          : <p className="subtext">Nenhum evento registrado (ocorrência inicial do seed de demonstração, criada sem trilha).</p>}

        {active && <div className="drawer-actions">
          {d.status === "OPEN" && <button className="button" disabled={busy} onClick={() => void act("ACKNOWLEDGED")}><Eye size={16} /> Assumir investigação (ACK)</button>}
          <label htmlFor="occ-note" className="drawer-label">Verificação e ação tomada</label>
          <textarea id="occ-note" value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={500} placeholder="Ex.: registro da linha 01 fechado; vazão zerou às 14:20." />
          <div className="drawer-buttons">
            <button className="button green" disabled={busy || !noteOk} onClick={() => void act("RESOLVED")}><CheckCircle2 size={16} /> Resolver</button>
            <button className="button" disabled={busy || !noteOk} onClick={() => void act("DISMISSED")}><XCircle size={16} /> Descartar (falso alarme)</button>
          </div>
          {!noteOk && <p className="subtext">Resolver ou descartar exige descrever a verificação (mínimo de 5 caracteres).</p>}
          {actionError && <p role="alert" className="drawer-error">{actionError}</p>}
        </div>}
        {!active && d.verificationNote && <div className="data-row" style={{ marginTop: 14 }}><span>Registro final</span><strong>{d.verificationNote}</strong></div>}
      </>}
      <p className="subtext" style={{ marginTop: 20 }}>Ocorrências de sensor indicam fluxo fora do padrão; não equivalem a vazamentos confirmados.</p>
    </div>
  </div>;
}
