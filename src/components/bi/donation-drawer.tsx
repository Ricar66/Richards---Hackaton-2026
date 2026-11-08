"use client";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, ExternalLink, HandHeart, PackageCheck, Printer, QrCode, ShieldCheck, Thermometer, X } from "lucide-react";
import type { DonationDetailDTO } from "@/modules/donations/application/donation-service";
import type { ColdEvidence } from "@/modules/cold-chain/application/cold-chain-service";
import { SANITARY_CHECKS } from "@/modules/donations/domain/donation-workflow";
import { coldHeadline } from "@/modules/donations/domain/passport";
import { isLoopbackUrl } from "@/lib/public-url";
import { dateBR, dayBR, hourBR, numBR } from "@/lib/format";
import { DONATION_LABEL, DONATION_TONE } from "./labels";
import { Seal, Tag } from "./primitives";
import type { DonationStatus } from "@/modules/analytics/domain/dashboard";
import { useLiveVersion } from "./live-stream";

type Recipient = { id: string; name: string; city: string };
type Equipment = { id: string; label: string; kindLabel: string; siteName: string; rangeText: string };
type Detail = DonationDetailDTO & { passportUrl?: string | null };
const STEP_TITLE: Partial<Record<DonationStatus, string>> = { PENDING_REVIEW: "Registrar verificação humana", AVAILABLE: "Reservar para uma instituição", RESERVED: "Confirmar a entrega" };
const ACTION_LABEL: Record<string, string> = { CREATED: "Lote cadastrado", AVAILABLE: "Verificado e disponível", RESERVED: "Reservado", DELIVERED: "Entrega confirmada", CANCELLED: "Cancelado", PASSPORT_ISSUED: "Passaporte emitido" };
const CHECKS = SANITARY_CHECKS.map(c => c.label);
const ORIGIN_OPTIONS = [
  { value: "WHOLE_PRODUCE", label: "Frutas, verduras ou legumes íntegros" },
  { value: "SEALED_PACKAGED", label: "Industrializado lacrado, dentro da validade" },
  { value: "UNSERVED_PREPARATION", label: "Preparado na cozinha, ainda não servido" },
  { value: "BUFFET_EXPOSED", label: "Buffet / balcão exposto — requer avaliação específica" },
  { value: "PLATE_LEFTOVERS", label: "Restos de prato — não são doáveis" },
  { value: "UNKNOWN", label: "Origem desconhecida — manter em revisão" },
] as const;
const SAFE_ORIGINS = new Set(["WHOLE_PRODUCE", "SEALED_PACKAGED", "UNSERVED_PREPARATION"]);

/** Temperatura do equipamento escolhido desde 24 h antes da pesagem: informa o item "tempo e temperatura" do checklist. */
function Evidence({ state }: { state: { ev: ColdEvidence | null; error?: string } | null }) {
  if (!state) return <p className="don-evidence" role="status"><Thermometer size={15} aria-hidden="true" /><span>Consultando a temperatura do equipamento…</span></p>;
  if (!state.ev) return <p className="don-evidence warn" role="status"><AlertTriangle size={15} aria-hidden="true" /><span>{state.error ?? "Sem evidência"}</span></p>;
  const s = state.ev.summary;
  const head = coldHeadline(s.inRangePct, s.coveragePct, s.excursionCount);
  const tone = head.tone === "clean" ? "ok" : "warn";
  return <div className={`don-evidence ${tone}`} role="status">
    {tone === "ok" ? <CheckCircle2 size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
    <div>
      {s.inRangePct === null
        ? <b>Sem leitura gravada desde 24 h antes da pesagem</b>
        : <b>{numBR(s.inRangePct, 1)}% do tempo medido na faixa ({state.ev.equipment.rangeText})</b>}
      <span>
        {state.ev.source === "SIMULATED" ? "Série simulada · " : ""}cobertura {numBR(s.coveragePct, s.coveragePct < 10 ? 1 : 0)}% · {s.excursionCount} excursões
        {s.minC !== null && s.maxC !== null ? ` · ${numBR(s.minC, 1)} a ${numBR(s.maxC, 1)} °C` : ""}
      </span>
      {head.note && <span>{head.note}</span>}
      {s.longest && <span>Maior excursão: {numBR(s.longest.minutes, 0)} min, pico {numBR(s.longest.peakC, 1)} °C, em {dayBR(s.longest.start)} {hourBR(s.longest.start)}.</span>}
      <small>Vai junto no Passaporte do Alimento. Avalie antes de declarar o checklist.</small>
    </div>
  </div>;
}

async function json<T>(res: Response): Promise<T> { const body = await res.json(); if (!res.ok) throw new Error(body.error || "Operação recusada"); return body as T; }

/** Cada etapa pede a declaração da pessoa responsável; o sistema registra quem declarou, não certifica o alimento. */
export function DonationDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: (msg: string) => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [recipients, setRecipients] = useState<Recipient[] | null>(null);
  const [version, setVersion] = useState(0);
  const [who, setWho] = useState("");
  const [foodOrigin, setFoodOrigin] = useState("");
  const [qualification, setQualification] = useState("");
  const [checks, setChecks] = useState<boolean[]>(CHECKS.map(() => false));
  const [recipientId, setRecipientId] = useState("");
  const [note, setNote] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  // Equipamento de origem: "" = ainda não escolhido; "none" = declarado fora de equipamento monitorado.
  const [equipments, setEquipments] = useState<Equipment[] | null>(null);
  const [originEq, setOriginEq] = useState("");
  const [evidence, setEvidence] = useState<{ eq: string; ev: ColdEvidence | null; error?: string } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  // Ao vivo: o mesmo lote mudou (em outra aba ou tela) → busca de novo a trilha confirmada pelo servidor.
  const liveVersion = useLiveVersion("donation.status", e => e.id === id);
  useEffect(() => {
    let alive = true;
    fetch(`/api/donations/${encodeURIComponent(id)}`, { cache: "no-store" }).then(r => json<Detail>(r))
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
  const needsEquipments = d?.status === "PENDING_REVIEW";
  useEffect(() => {
    if (!needsEquipments) return;
    let alive = true;
    fetch("/api/cold-chain/equipments", { cache: "no-store" }).then(r => json<Equipment[]>(r)).then(x => { if (alive) setEquipments(x); }, () => { if (alive) setEquipments([]); });
    return () => { alive = false; };
  }, [needsEquipments]);
  // Evidência do equipamento escolhido: o responsável vê a temperatura ANTES de declarar o checklist.
  useEffect(() => {
    if (!originEq || originEq === "none") return;
    let alive = true;
    fetch(`/api/donations/${encodeURIComponent(id)}/cold-evidence?equipmentId=${encodeURIComponent(originEq)}`, { cache: "no-store" }).then(r => json<ColdEvidence>(r))
      .then(ev => { if (alive) setEvidence({ eq: originEq, ev }); }, e => { if (alive) setEvidence({ eq: originEq, ev: null, error: e instanceof Error ? e.message : "Sem conexão" }); });
    return () => { alive = false; };
  }, [id, originEq]);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); opener?.focus(); };
  }, []);

  async function issuePassport() {
    setBusy(true); setActionError("");
    try {
      await json(await fetch(`/api/donations/${encodeURIComponent(id)}/passport`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
      setVersion(v => v + 1); onChanged("Passaporte do Alimento emitido");
    } catch (e) { setActionError(e instanceof Error ? e.message : "Falha ao emitir o passaporte"); }
    finally { setBusy(false); }
  }

  async function send(payload: Record<string, string | boolean | null>, msg: string) {
    setBusy(true); setActionError("");
    try {
      await json(await fetch(`/api/donations/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
      setWho(""); setNote(""); setReason(""); setFoodOrigin(""); setQualification(""); setCancelling(false); setChecks(CHECKS.map(() => false));
      setOriginEq(""); setEvidence(null);
      setVersion(v => v + 1); onChanged(msg);
    } catch (e) { setActionError(e instanceof Error ? e.message : "Falha na operação"); }
    finally { setBusy(false); }
  }

  const status = d?.status as DonationStatus | undefined;
  const open = status === "PENDING_REVIEW" || status === "AVAILABLE" || status === "RESERVED";
  const ok = status === "PENDING_REVIEW" ? who.trim().length >= 3 && qualification.trim().length >= 3 && SAFE_ORIGINS.has(foodOrigin) && checks.every(Boolean) && originEq !== "" : status === "AVAILABLE" ? !!recipientId : status === "RESERVED" ? who.trim().length >= 3 : false;
  function advance() {
    if (status === "PENDING_REVIEW") void send({
      status: "AVAILABLE", verifiedBy: who.trim(), foodOrigin, reviewerQualification: qualification.trim(),
      inspectionOk: checks[0], conservationOk: checks[1], validityOk: checks[2], transportOk: checks[3],
      originEquipmentId: originEq === "none" ? null : originEq,
      note: note.trim(),
    }, "Triagem documentada: lote disponível");
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
          {d.originEquipment && <div><dt>Equipamento de origem</dt><dd>{d.originEquipment.label}<small>{d.originEquipment.kindLabel}</small></dd></div>}
        </dl>

        <section className="don-passport" aria-labelledby="don-pass">
          <h3 className="drawer-section" id="don-pass">Passaporte do Alimento</h3>
          {d.passportToken && d.passportUrl ? <div className="don-pass-row">
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG gerado no servidor, rota privada do operador. */}
            <img src={`/api/donations/${encodeURIComponent(id)}/passport-qr`} alt="QR do Passaporte do Alimento deste lote" width={112} height={112} />
            <div>
              <p className="muted-text small">Quem escanear vê origem, temperatura do equipamento, triagem e destino. Nome de quem recebeu, notas e operador não aparecem.</p>
              <div className="btn-row">
                <a className="btn ghost" href={d.passportUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} aria-hidden="true" /> Abrir passaporte</a>
                <a className="btn ghost" href={`/etiqueta/${encodeURIComponent(id)}`} target="_blank" rel="noopener"><Printer size={15} aria-hidden="true" /> Etiqueta</a>
              </div>
              {isLoopbackUrl(d.passportUrl) && <p className="form-error">O QR aponta para {new URL(d.passportUrl).host}: celular não abre. Abra o BI pelo IP da rede ou defina RICHARDS_PUBLIC_URL.</p>}
            </div>
          </div> : <div className="btn-row">
            <button className="btn ghost" disabled={busy} onClick={() => void issuePassport()}><QrCode size={15} aria-hidden="true" /> Emitir passaporte</button>
            <span className="muted-text small">Lote anterior ao passaporte. Lotes novos já nascem com ele.</span>
          </div>}
        </section>

        {open && !cancelling && <div className="step-form">
          <h3 className="drawer-section">{STEP_TITLE[status]}</h3>
          {status === "PENDING_REVIEW" && <>
            <label className="field-label" htmlFor="don-origin">Origem do alimento (obrigatória)</label>
            <select id="don-origin" value={foodOrigin} onChange={e => setFoodOrigin(e.target.value)}>
              <option value="">Selecione a origem real</option>
              {ORIGIN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {foodOrigin && !SAFE_ORIGINS.has(foodOrigin) && <p className="form-error">Esta origem permanece em revisão no MVP. Não significa proibição universal para todo buffet; exija avaliação sanitária local. Restos de prato não podem ser destinados à doação.</p>}
            <label className="field-label" htmlFor="don-equip">De qual equipamento saiu o alimento (obrigatório)</label>
            <select id="don-equip" value={originEq} onChange={e => setOriginEq(e.target.value)} disabled={!equipments}>
              <option value="">{equipments ? "Selecione o equipamento" : "Carregando equipamentos…"}</option>
              {equipments?.map(e => <option key={e.id} value={e.id}>{e.label} · {e.kindLabel} ({e.rangeText})</option>)}
              <option value="none">Não estava em equipamento monitorado</option>
            </select>
            {originEq && originEq !== "none" && <Evidence state={evidence?.eq === originEq ? evidence : null} />}
            {originEq === "none" && <p className="muted-text small">O passaporte vai dizer que a conservação foi declarada, sem série de temperatura.</p>}
            <fieldset className="checks"><legend className="field-label">Declaração da pessoa responsável</legend>
              {CHECKS.map((c, i) => <label key={c}><input type="checkbox" checked={checks[i]} onChange={e => setChecks(xs => xs.map((x, j) => j === i ? e.target.checked : x))} />{c}</label>)}
            </fieldset>
            <label className="field-label" htmlFor="don-who">Nome de quem verificou</label>
            <input id="don-who" value={who} onChange={e => setWho(e.target.value)} maxLength={120} placeholder="Nome do responsável pela verificação" aria-describedby="don-who-hint" />
            <p className="muted-text small" id="don-who-hint">No passaporte público aparecem só o primeiro nome e a inicial do sobrenome.</p>
            <label className="field-label" htmlFor="don-role">Cargo ou habilitação do responsável</label>
            <input id="don-role" value={qualification} onChange={e => setQualification(e.target.value)} maxLength={120} placeholder="Ex.: Nutricionista · CRN-3 00000" aria-describedby="don-role-hint" />
            <p className="muted-text small" id="don-role-hint">Aparece no passaporte público como foi escrito.</p>
          </>}
          {status === "AVAILABLE" && <>
            <label className="field-label" htmlFor="don-rec">Instituição receptora</label>
            <select id="don-rec" value={recipientId} onChange={e => setRecipientId(e.target.value)} disabled={!recipients}>
              <option value="">{recipients ? "Escolha a instituição" : "Carregando instituições…"}</option>
              {recipients?.map(r => <option key={r.id} value={r.id}>{r.name} · {r.city}</option>)}
            </select>
            {recipients && !recipients.length && <p className="form-error">Nenhuma instituição ativa cadastrada. Cadastre a instituição real no terminal: <code>{'pnpm instituicao:cadastrar --nome "…" --cidade "…"'}</code></p>}
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
          {status === "PENDING_REVIEW" && <p className="muted-text small">O RICHARDS registra origem, checklist e responsável com cargo/habilitação; não certifica o alimento. A legislação exige responsável habilitado nas hipóteses aplicáveis e verificação das normas sanitárias locais.</p>}
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
