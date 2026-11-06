"use client";
import { useEffect, useRef, useState } from "react";
import { Ban, CheckCircle2, HandHeart, PackageCheck, ShieldCheck, X } from "lucide-react";
import type { DonationDetailDTO } from "@/modules/donations/application/donation-service";
import { dateBR, numBR } from "@/lib/format";
import { DONATION_LABEL, DONATION_TONE } from "./labels";
import { Seal, Tag } from "./primitives";
import type { DonationStatus } from "@/modules/analytics/domain/dashboard";
import { useLiveVersion } from "./live-stream";

type Recipient = { id: string; name: string; city: string };
const STEP_TITLE: Partial<Record<DonationStatus, string>> = { PENDING_REVIEW: "Registrar verificação humana", AVAILABLE: "Reservar para uma instituição", RESERVED: "Confirmar a entrega" };
const ACTION_LABEL: Record<string, string> = { CREATED: "Lote cadastrado", AVAILABLE: "Verificado e disponível", RESERVED: "Reservado", DELIVERED: "Entrega confirmada", CANCELLED: "Cancelado" };
const CHECKS = ["Inspeção visual sem sinais de deterioração", "Conservação e temperatura adequadas ao tipo de alimento", "Validade e embalagem conferidas"];

async function json<T>(res: Response): Promise<T> { const body = await res.json(); if (!res.ok) throw new Error(body.error || "Operação recusada"); return body as T; }

/** Cada etapa pede a declaração da pessoa responsável; o sistema registra quem declarou, não certifica o alimento. */
export function DonationDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: (msg: string) => void }) {
  const [d, setD] = useState<DonationDetailDTO | null>(null);
  const [error, setError] = useState("");
  const [recipients, setRecipients] = useState<Recipient[] | null>(null);
  const [version, setVersion] = useState(0);
  const [who, setWho] = useState("");
  const [checks, setChecks] = useState<boolean[]>(CHECKS.map(() => false));
  const [recipientId, setRecipientId] = useState("");
  const [note, setNote] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  // Ao vivo: o mesmo lote mudou (em outra aba ou tela) → busca de novo a trilha confirmada pelo servidor.
  const liveVersion = useLiveVersion("donation.status", e => e.id === id);
  useEffect(() => {
    let alive = true;
    fetch(`/api/donations/${encodeURIComponent(id)}`, { cache: "no-store" }).then(r => json<DonationDetailDTO>(r))
      .then(x => { if (alive) { setD(x); setError(""); } }, e => { if (alive) setError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Sem conexão com o servidor"); });
    return () => { alive = false; };
  }, [id, version, liveVersion]);
  const needsRecipients = d?.status === "AVAILABLE";
  useEffect(() => {
    if (!needsRecipients) return;
    let alive = true;
    fetch("/api/recipients", { cache: "no-store" }).then(r => json<Recipient[]>(r)).then(x => { if (alive) setRecipients(x); }, () => { if (alive) setRecipients([]); });
    return () => { alive = false; };
  }, [needsRecipients]);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); opener?.focus(); };
  }, []);

  async function send(payload: Record<string, string>, msg: string) {
    setBusy(true); setActionError("");
    try {
      await json(await fetch(`/api/donations/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
      setWho(""); setNote(""); setReason(""); setCancelling(false); setChecks(CHECKS.map(() => false));
      setVersion(v => v + 1); onChanged(msg);
    } catch (e) { setActionError(e instanceof Error ? e.message : "Falha na operação"); }
    finally { setBusy(false); }
  }

  const status = d?.status as DonationStatus | undefined;
  const open = status === "PENDING_REVIEW" || status === "AVAILABLE" || status === "RESERVED";
  const ok = status === "PENDING_REVIEW" ? who.trim().length >= 3 && checks.every(Boolean) : status === "AVAILABLE" ? !!recipientId : status === "RESERVED" ? who.trim().length >= 3 : false;
  function advance() {
    if (status === "PENDING_REVIEW") void send({ status: "AVAILABLE", verifiedBy: who.trim(), note: [`Checklist declarado: ${CHECKS.join("; ")}`, note.trim()].filter(Boolean).join(" · ") }, "Verificação registrada: lote disponível");
    if (status === "AVAILABLE") void send({ status: "RESERVED", recipientId, note: note.trim() }, "Lote reservado para a instituição");
    if (status === "RESERVED") void send({ status: "DELIVERED", receivedBy: who.trim(), note: note.trim() }, "Entrega confirmada: kg entram no impacto");
  }

  return <div className="drawer-scrim" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="don-title" tabIndex={-1} ref={panel}>
      <header className="drawer-head">
        <div><span className="eyebrow">Lote de alimentos</span><h2 id="don-title">{d?.description ?? "Carregando…"}</h2></div>
        <button className="icon-btn" onClick={onClose} aria-label="Fechar lote"><X size={17} /></button>
      </header>
      {error && <p role="alert" className="form-error">{error}</p>}
      {!d && !error && <div className="drawer-loading" role="status"><span className="sk" /><span className="sk" /></div>}
      {d && status && <div className="drawer-body">
        <div className="tag-row"><Tag tone={DONATION_TONE[status]}>{DONATION_LABEL[status]}</Tag><Seal source={d.source} /></div>
        <dl className="facts">
          <div><dt>Peso declarado</dt><dd>{numBR(d.kg, 2)} kg</dd></div>
          <div><dt>Cadastrado em</dt><dd>{dateBR(d.createdAt)}</dd></div>
          <div><dt>Verificação</dt><dd>{d.verifiedBy ? <>{d.verifiedBy}<small>{d.verifiedAt ? dateBR(d.verifiedAt) : ""}</small></> : "pendente"}</dd></div>
          <div><dt>Instituição</dt><dd>{d.recipient ? <>{d.recipient.name}<small>{d.recipient.city}</small></> : "—"}</dd></div>
          {d.receivedBy && <div><dt>Recebido por</dt><dd>{d.receivedBy}<small>{d.receivedAt ? dateBR(d.receivedAt) : ""}</small></dd></div>}
          {d.cancelReason && <div><dt>Motivo do cancelamento</dt><dd>{d.cancelReason}</dd></div>}
        </dl>

        {open && !cancelling && <div className="step-form">
          <h3 className="drawer-section">{STEP_TITLE[status]}</h3>
          {status === "PENDING_REVIEW" && <>
            <fieldset className="checks"><legend className="field-label">Declaração da pessoa responsável</legend>
              {CHECKS.map((c, i) => <label key={c}><input type="checkbox" checked={checks[i]} onChange={e => setChecks(xs => xs.map((x, j) => j === i ? e.target.checked : x))} />{c}</label>)}
            </fieldset>
            <label className="field-label" htmlFor="don-who">Nome de quem verificou</label>
            <input id="don-who" value={who} onChange={e => setWho(e.target.value)} maxLength={120} placeholder="Ex.: Paula Mendes, nutricionista" />
          </>}
          {status === "AVAILABLE" && <>
            <label className="field-label" htmlFor="don-rec">Instituição receptora</label>
            <select id="don-rec" value={recipientId} onChange={e => setRecipientId(e.target.value)} disabled={!recipients}>
              <option value="">{recipients ? "Escolha a instituição" : "Carregando instituições…"}</option>
              {recipients?.map(r => <option key={r.id} value={r.id}>{r.name} · {r.city}</option>)}
            </select>
            {recipients && !recipients.length && <p className="form-error">Nenhuma instituição ativa cadastrada.</p>}
          </>}
          {status === "RESERVED" && <>
            <label className="field-label" htmlFor="don-recv">Quem recebeu na instituição</label>
            <input id="don-recv" value={who} onChange={e => setWho(e.target.value)} maxLength={120} placeholder="Nome de quem conferiu e assinou o recebimento" />
          </>}
          <label className="field-label" htmlFor="don-note">Observação (opcional)</label>
          <input id="don-note" value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="Ex.: 2 caixas, conferido no local" />
          <div className="btn-row">
            <button className="btn primary" disabled={busy || !ok} onClick={advance}>
              {status === "PENDING_REVIEW" ? <><ShieldCheck size={15} /> Registrar verificação</> : status === "AVAILABLE" ? <><HandHeart size={15} /> Reservar</> : <><PackageCheck size={15} /> Confirmar entrega</>}
            </button>
            <button className="btn ghost" disabled={busy} onClick={() => setCancelling(true)}><Ban size={15} /> Cancelar lote</button>
          </div>
          {status === "PENDING_REVIEW" && <p className="muted-text small">O RICHARDS registra quem declarou a verificação; não certifica a segurança do alimento.</p>}
        </div>}
        {open && cancelling && <div className="step-form">
          <h3 className="drawer-section">Cancelar lote</h3>
          <label className="field-label" htmlFor="don-reason">Motivo</label>
          <input id="don-reason" value={reason} onChange={e => setReason(e.target.value)} maxLength={300} placeholder="Ex.: embalagem violada na triagem" />
          <div className="btn-row">
            <button className="btn danger" disabled={busy || reason.trim().length < 5} onClick={() => void send({ status: "CANCELLED", reason: reason.trim() }, "Lote cancelado com motivo registrado")}><Ban size={15} /> Confirmar cancelamento</button>
            <button className="btn ghost" onClick={() => setCancelling(false)}>Voltar</button>
          </div>
        </div>}
        {actionError && <p role="alert" className="form-error">{actionError}</p>}

        <h3 className="drawer-section">Trilha do lote</h3>
        <ol className="timeline">{d.timeline.map((t, i) => <li key={i} className={`tl-${t.action.toLowerCase()}`}><b>{ACTION_LABEL[t.action] ?? t.action}</b><span>{dateBR(t.at)} · {t.actor ?? "autor não registrado"}</span>{t.detail && <q>{t.detail}</q>}</li>)}</ol>
        {!d.timeline.length && <p className="muted-text">Lote do seed de demonstração, criado sem trilha de auditoria.</p>}
        {status === "DELIVERED" && <p className="success-note"><CheckCircle2 size={15} /> Este lote conta nos kg entregues do período em que foi recebido.</p>}
      </div>}
    </div>
  </div>;
}
