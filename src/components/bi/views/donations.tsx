"use client";
import { useState } from "react";
import { ChevronRight, ClipboardCheck, HeartHandshake, PackageOpen, Plus, ShieldCheck, Truck } from "lucide-react";
import type { DashboardDTO, DashboardDonation, DonationStatus } from "@/modules/analytics/domain/dashboard";
import { dateBR, numBR } from "@/lib/format";
import { notifyDataChanged, useDashboard } from "../hooks";
import { useShell } from "../shell";
import { GlobalFilters } from "../filters";
import { DonationDrawer } from "../donation-drawer";
import { EmptyState, Footnote, KpiTile, PageHeader, Panel, StaleBanner, Tag } from "../primitives";
import { DONATION_LABEL, SOURCE_LABEL } from "../labels";

const COLUMNS: { status: DonationStatus; hint: string; next: string }[] = [
  { status: "PENDING_REVIEW", hint: "Aguardam verificação humana", next: "Verificar" },
  { status: "AVAILABLE", hint: "Verificados, sem destino", next: "Reservar" },
  { status: "RESERVED", hint: "Com instituição definida", next: "Confirmar entrega" },
  { status: "DELIVERED", hint: "Recebimento confirmado no período", next: "Ver trilha" },
];

function NewBatch({ onDone }: { onDone: () => void }) {
  const { toast } = useShell();
  const [description, setDescription] = useState("");
  const [kg, setKg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valid = description.trim().length >= 4 && Number(kg) > 0;
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!valid) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/donations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: description.trim(), weightKg: Number(kg) }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Cadastro recusado");
      toast({ tone: "ok", title: "Lote cadastrado", body: "Entra como verificação pendente; só fica disponível após a verificação humana." });
      setDescription(""); setKg(""); notifyDataChanged(); onDone();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha no cadastro"); }
    finally { setBusy(false); }
  }
  return <form className="new-batch" onSubmit={submit}>
    <label><span className="field-label">Descrição do lote</span><input value={description} onChange={e => setDescription(e.target.value)} maxLength={180} placeholder="Ex.: Hortaliças da gôndola · 3 caixas" required minLength={4} /></label>
    <label className="kg"><span className="field-label">Peso (kg)</span><input type="number" inputMode="decimal" min="0.01" step="0.01" value={kg} onChange={e => setKg(e.target.value)} required /></label>
    <button className="btn primary" type="submit" disabled={busy || !valid}><Plus size={15} /> Cadastrar lote</button>
    {error && <p role="alert" className="form-error">{error}</p>}
  </form>;
}

function BatchCard({ d, action, onOpen }: { d: DashboardDonation; action: string; onOpen: () => void }) {
  return <li className="batch">
    <button onClick={onOpen} aria-label={`${d.description}, ${numBR(d.kg)} kg, ${DONATION_LABEL[d.status]}. ${action}`}>
      <span className="batch-top"><b>{d.description}</b><span className="batch-kg">{numBR(d.kg)}<small> kg</small></span></span>
      <span className="batch-meta">
        {d.status === "PENDING_REVIEW" && <>cadastrado {dateBR(d.createdAt)}</>}
        {d.status === "AVAILABLE" && <>verificado por {d.verifiedBy ?? "—"}</>}
        {d.status === "RESERVED" && <>para {d.recipient ?? "—"}</>}
        {d.status === "DELIVERED" && <>{d.recipient ?? "—"} · recebido por {d.receivedBy ?? "não registrado"}</>}
      </span>
      <span className="batch-foot">{d.source !== "MANUAL" && <Tag tone="sim">{SOURCE_LABEL[d.source]}</Tag>}<span className="batch-action">{action} <ChevronRight size={14} /></span></span>
    </button>
  </li>;
}

export function Donations({ initial }: { initial: DashboardDTO }) {
  const { data, stale } = useDashboard(initial);
  const { toast } = useShell();
  const [form, setForm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const k = data.kpis;
  const items = data.donations.items;
  const from = new Date(data.filter.from).getTime();
  const inColumn = (s: DonationStatus) => items.filter(d => d.status === s && (s !== "DELIVERED" || (d.receivedAt && new Date(d.receivedAt).getTime() >= from)));
  const cancelled = items.filter(d => d.status === "CANCELLED");
  const recipients = new Set(inColumn("DELIVERED").map(d => d.recipientId)).size;

  return <>
    <PageHeader kicker="Impacto alimentar rastreável" title="Doações & impacto" actions={<button className="btn primary" onClick={() => setForm(f => !f)} aria-expanded={form}><Plus size={15} /> Novo lote</button>}>
      Do excedente à entrega confirmada. Só lote com verificação humana registrada fica disponível, e só entrega confirmada por quem recebeu conta como impacto.
    </PageHeader>
    <GlobalFilters data={data} showDevice={false} />
    <StaleBanner since={stale} />
    {data.filter.siteId || data.filter.deviceId ? <p className="info-note">Lotes pertencem à organização: filtros de unidade e sensor não se aplicam a doações.</p> : null}
    <div className="kpi-grid">
      <KpiTile label="Kg entregues" icon={<HeartHandshake size={15} />} value={k.deliveredKg} unit=" kg" accent="#0e9a73" foot={`${k.deliveredCount} entrega(s) confirmada(s) no período`} />
      <KpiTile label="Kg a caminho" icon={<Truck size={15} />} value={k.availableKg} unit=" kg" accent="#4466d6" foot="disponíveis + reservados (ainda não é impacto)" />
      <KpiTile label="Aguardando verificação" icon={<ClipboardCheck size={15} />} value={k.pendingReview} digits={0} accent="#cf7a12" foot="lotes sem verificação humana" />
      <KpiTile label="Instituições atendidas" icon={<PackageOpen size={15} />} value={recipients} digits={0} accent="#6f8389" foot="com entrega confirmada no período" />
    </div>
    {form && <Panel id="p-new" eyebrow="Cadastro" title="Novo lote de excedente" caption="Nasce como verificação pendente e origem MANUAL."><NewBatch onDone={() => setForm(false)} /></Panel>}
    <div className="board" role="list" aria-label="Fluxo dos lotes">
      {COLUMNS.map(c => { const xs = inColumn(c.status); return <section key={c.status} className={`board-col ${c.status.toLowerCase()}`} role="listitem" aria-labelledby={`col-${c.status}`}>
        <header><span><b id={`col-${c.status}`}>{DONATION_LABEL[c.status]}</b><small>{c.hint}</small></span><span className="col-sum"><b>{xs.length}</b><small>{numBR(xs.reduce((n, d) => n + d.kg, 0))} kg</small></span></header>
        {xs.length ? <ul>{xs.map(d => <BatchCard key={d.id} d={d} action={c.next} onOpen={() => setOpenId(d.id)} />)}</ul> : <p className="col-empty">Nenhum lote</p>}
      </section>; })}
    </div>
    <div className="grid-half">
      <Panel id="p-cancel" eyebrow="Fora do fluxo" title={`Cancelados no período · ${cancelled.length}`}>
        {cancelled.length ? <ul className="recent">{cancelled.map(d => <li key={d.id}><button onClick={() => setOpenId(d.id)}><i style={{ background: "#8b989d" }} /><span className="recent-main"><b>{d.description}</b><small>{numBR(d.kg)} kg · {dateBR(d.createdAt)}</small></span><Tag tone="neutral">Cancelado</Tag></button></li>)}</ul>
          : <EmptyState title="Nenhum lote cancelado" />}
      </Panel>
      <Panel id="p-rules" eyebrow="Regras" title="O que a plataforma garante">
        <ul className="method">
          <li><ShieldCheck size={14} /> <b>Disponível</b> só com nome de quem verificou e checklist declarado.</li>
          <li><HeartHandshake size={14} /> <b>Reservado</b> só para instituição ativa cadastrada.</li>
          <li><Truck size={14} /> <b>Entregue</b> só com o nome de quem recebeu; aí os kg entram no impacto.</li>
          <li><ClipboardCheck size={14} /> Toda etapa fica na trilha com autor e horário; cancelar exige motivo.</li>
        </ul>
      </Panel>
    </div>
    {openId && <DonationDrawer key={openId} id={openId} onClose={() => setOpenId(null)} onChanged={msg => { toast({ tone: "ok", title: msg }); notifyDataChanged(); }} />}
    <Footnote data={data} />
  </>;
}
