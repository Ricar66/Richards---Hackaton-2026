"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Recycle, PackagePlus, ClipboardCheck, Truck, FileCheck2, Download, RefreshCw, Leaf } from "lucide-react";
import type { CircularSnapshot, CircularDetail } from "@/modules/circular/application/circular-service";
import { MATERIALS, METHODS, MAX_FILE_BYTES } from "@/modules/circular/domain/contracts";
import { ORIGIN_LABEL, MATERIAL_LABEL, METHOD_LABEL, STATUS_LABEL, EVIDENCE_LABEL } from "@/modules/circular/domain/labels";

type Source = "MANUAL" | "SIMULATED";
type Range = "24h" | "7d" | "30d";
const number = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const date = (v: string) => new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
function key() { return [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, "0")).join(""); }
const fdText = (f: FormData, name: string) => String(f.get(name) ?? "").trim();
const iso = (f: FormData, name: string) => new Date(fdText(f, name)).toISOString();
async function request(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const result = await res.json(); if (!res.ok) throw new Error(result.error ?? "Operação indisponível"); return result;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="cur-field"><span>{label}</span>{children}</label>; }
function Options({ labels }: { labels: Record<string, string> }) { return <>{Object.entries(labels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</>; }
function DateField({ name, label, future = 0 }: { name: string; label: string; future?: number }) {
  const ref = useRef<HTMLInputElement>(null);
  return <Field label={label}><span className="cur-date"><input ref={ref} type="datetime-local" name={name} required /><button type="button" onClick={() => { const d = new Date(Date.now() + future); if (ref.current) ref.current.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16); }}>{future ? "Sugerir data" : "Agora"}</button></span></Field>;
}
function Attest({ text }: { text: string }) { return <label className="cur-attest"><input name="attested" type="checkbox" required />{text}</label>; }
function useSubmission() {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const token = useRef<string | null>(null);
  return { busy, error, token, async run(work: () => Promise<void>) { if (busy) return; setBusy(true); setError(""); try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "Falha na operação"); } finally { setBusy(false); } } };
}
function NewBatch({ sites, source, done }: { sites: CircularSnapshot["sites"]; source: Source; done(id: string): Promise<void> }) {
  const job = useSubmission();
  function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const form = e.currentTarget, f = new FormData(form); void job.run(async () => {
    const body = { requestKey: job.token.current ??= key(), siteId: fdText(f,"siteId"), description: fdText(f,"description"), weightKg: Number(f.get("weightKg")), origin: fdText(f,"origin"), material: fdText(f,"material"), reason: fdText(f,"reason"), source, occurredAt: iso(f,"occurredAt") };
    const result = await request("/api/circular/batches", "POST", body); job.token.current = null; form.reset(); await done(result.id);
  }); }
  return <form onSubmit={submit} className="cur-form"><div className="cur-form-grid">
    <Field label="Descrição da sobra"><input name="description" required minLength={4} maxLength={180} placeholder="Ex.: aparas segregadas do preparo" /></Field>
    <Field label="Unidade"><select name="siteId" required><option value="">Escolha a unidade</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
    <Field label="Peso registrado (kg)"><input name="weightKg" type="number" min="0.001" max="100000" step="0.001" required inputMode="decimal" /></Field>
    <DateField name="occurredAt" label="Data da pesagem (hora local)" />
    <Field label="Origem"><select name="origin" defaultValue="UNKNOWN"><Options labels={ORIGIN_LABEL} /></select></Field>
    <Field label="Material"><select name="material" defaultValue="UNKNOWN"><Options labels={MATERIAL_LABEL} /></select></Field>
    <Field label="Motivo da sobra"><textarea name="reason" required minLength={5} maxLength={500} rows={2} /></Field>
  </div><p className="cur-note">Este cadastro será <strong>{source === "SIMULATED" ? "SIMULADO" : "MANUAL"}</strong>, conforme o filtro ativo. Registro manual não certifica a medição ou segurança do alimento.</p>
  <button className="btn primary" disabled={job.busy || !sites.length}><PackagePlus size={16} />{job.busy ? "Registrando…" : "Registrar para triagem"}</button>{job.error && <p role="alert" className="cur-error">{job.error}</p>}</form>;
}
function PartnerForm({ source, done, initial }: { source: Source; done(): Promise<void>; initial?: CircularSnapshot["partners"][number] }) {
  const job = useSubmission();
  function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const form = e.currentTarget, f = new FormData(form); void job.run(async () => {
    await request("/api/circular/partners", initial ? "PATCH" : "POST", { ...(initial ? { id: initial.id } : {}), name: fdText(f,"name"), city: fdText(f,"city"), source, methods: f.getAll("methods"), materials: f.getAll("materials"), authorizationReference: fdText(f,"authorizationReference"), reviewedBy: fdText(f,"reviewedBy"), reviewExpiresAt: iso(f,"reviewExpiresAt"), attested: f.has("attested") }); form.reset(); await done();
  }); }
  return <form onSubmit={submit} className="cur-form"><div className="cur-form-grid">
    <Field label="Nome do operador"><input name="name" required minLength={3} maxLength={150} defaultValue={initial?.name} /></Field><Field label="Cidade"><input name="city" required minLength={2} maxLength={100} defaultValue={initial?.city} /></Field>
    <Field label="Referência documental e verificação aplicável"><textarea name="authorizationReference" minLength={5} maxLength={300} required rows={2} defaultValue={initial?.authorizationReference} placeholder="Referência da autorização ou enquadramento conferido pelo responsável" /></Field>
    <Field label="Responsável pela conferência"><input name="reviewedBy" required minLength={3} maxLength={120} /></Field>
    <DateField name="reviewExpiresAt" label="Revisar o cadastro até (máx. 366 dias)" future={30 * 86400000} />
  </div><fieldset><legend>Processos declarados (ao menos um)</legend>{METHODS.map(m => <label key={m}><input type="checkbox" name="methods" value={m} defaultChecked={initial?.methods.includes(m)} />{METHOD_LABEL[m]}</label>)}</fieldset>
    <fieldset><legend>Materiais aceitos declarados (ao menos um)</legend>{MATERIALS.filter(m => m !== "UNKNOWN").map(m => <label key={m}><input type="checkbox" name="materials" value={m} defaultChecked={initial?.materials.includes(m)} />{MATERIAL_LABEL[m]}</label>)}</fieldset>
    <Attest text="Conferi a documentação, os materiais aceitos e os requisitos aplicáveis. O sistema registra minha declaração e não emite licença." />
    <button className="btn primary" disabled={job.busy}>{initial ? "Registrar conferência e reativar" : "Cadastrar operador"} · {source === "SIMULATED" ? "SIMULADO" : "MANUAL"}</button>{job.error && <p role="alert" className="cur-error">{job.error}</p>}
  </form>;
}
type Action = "TRIAGE" | "SCHEDULE" | "COLLECT" | "RECEIPT" | "TREATMENT" | "DISPOSAL" | "CANCEL";
function ActionForm({ item, partners, done }: { item: CircularDetail; partners: CircularSnapshot["partners"]; done(): Promise<void> }) {
  const first: Action = item.status === "REGISTERED" ? "TRIAGE" : item.status === "RESIDUE" ? "SCHEDULE" : item.collectedKg < item.weightKg ? "COLLECT" : item.receivedKg < item.collectedKg ? "RECEIPT" : item.method === "DISPOSAL" ? "DISPOSAL" : "TREATMENT";
  const [action, setAction] = useState<Action>(first); const job = useSubmission();
  const options: { id: Action; label: string; allowed: boolean }[] = [
    { id: "TRIAGE", label: "1 · Triagem", allowed: item.status === "REGISTERED" }, { id: "SCHEDULE", label: "2 · Destinação", allowed: ["RESIDUE","SCHEDULED"].includes(item.status) },
    { id: "COLLECT", label: "3 · Coleta", allowed: ["SCHEDULED","COLLECTED","RECEIVED","EVIDENCED"].includes(item.status) && item.collectedKg < item.weightKg },
    { id: "RECEIPT", label: "4 · Recebimento", allowed: item.receivedKg < item.collectedKg },
    { id: item.method === "DISPOSAL" ? "DISPOSAL" : "TREATMENT", label: "5 · Comprovação final", allowed: item.confirmedKg < item.receivedKg },
    { id: "CANCEL", label: "Cancelar cadastro", allowed: ["REGISTERED","RESIDUE","SCHEDULED"].includes(item.status) },
  ];
  const available = options.filter(o => o.allowed);
  const effectiveAction = available.some(o => o.id === action) ? action : available[0]?.id;
  if (!effectiveAction) return <p className="cur-note">{item.status === "DONATION_REFERRED" ? "O lote segue a verificação sanitária e o recebimento no módulo de Doações." : item.status === "CANCELLED" ? "Cadastro cancelado, histórico preservado." : "Toda a massa registrada está coberta por comprovantes desta destinação."}</p>;
  const evidence = ["RECEIPT","TREATMENT","DISPOSAL"].includes(effectiveAction);
  const maximum = effectiveAction === "COLLECT" ? item.weightKg - item.collectedKg : effectiveAction === "RECEIPT" ? item.collectedKg - item.receivedKg : item.receivedKg - item.confirmedKg;
  function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); void job.run(async () => {
    const base = { version: item.version, attested: f.has("attested") };
    let body: unknown;
    if (effectiveAction === "TRIAGE") body = { ...base, action: effectiveAction, decision: fdText(f,"decision"), origin: fdText(f,"origin"), material: fdText(f,"material"), reviewedBy: fdText(f,"reviewedBy"), note: fdText(f,"note") };
    else if (effectiveAction === "SCHEDULE") body = { ...base, action: effectiveAction, partnerId: fdText(f,"partnerId"), method: fdText(f,"method"), scheduledAt: iso(f,"scheduledAt"), reason: fdText(f,"reason") };
    else if (effectiveAction === "COLLECT") body = { ...base, action: effectiveAction, requestKey: job.token.current ??= key(), weightKg: Number(f.get("weightKg")), eventAt: iso(f,"eventAt"), receivedBy: fdText(f,"receivedBy") };
    else if (effectiveAction === "CANCEL") body = { action: effectiveAction, version: item.version, reason: fdText(f,"reason") };
    else {
      const file = f.get("file"); if (!(file instanceof File) || !file.size || file.size > MAX_FILE_BYTES) throw new Error("Selecione um PDF, PNG ou JPEG com até 2 MiB");
      const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = () => reject(new Error("Não foi possível ler o arquivo")); reader.readAsDataURL(file); });
      body = { ...base, kind: effectiveAction, requestKey: job.token.current ??= key(), weightKg: Number(f.get("weightKg")), eventAt: iso(f,"eventAt"), documentReference: fdText(f,"documentReference"), reviewedBy: fdText(f,"reviewedBy"), file: { mime: file.type, base64 } };
    }
    await request(`/api/circular/batches/${item.id}${evidence ? "/evidence" : ""}`, evidence ? "POST" : "PATCH", body); job.token.current = null; await done();
  }); }
  return <div><div className="cur-actions">{available.map(o => <button type="button" key={o.id} aria-pressed={effectiveAction === o.id} onClick={() => { setAction(o.id); job.token.current = null; }}>{o.label}</button>)}</div>
  <form key={effectiveAction} onSubmit={submit} className="cur-form"><div className="cur-form-grid">
    {effectiveAction === "TRIAGE" && <><Field label="Decisão humana"><select name="decision"><option value="RESIDUE">Classificar como resíduo</option><option value="DONATION">Encaminhar à verificação de doação</option></select></Field><Field label="Origem conferida"><select name="origin" defaultValue={item.origin}><Options labels={ORIGIN_LABEL} /></select></Field><Field label="Material conferido"><select name="material" defaultValue={item.material}><Options labels={MATERIAL_LABEL} /></select></Field><Field label="Responsável"><input name="reviewedBy" required minLength={3} maxLength={120} /></Field><Field label="Fundamento da triagem"><textarea name="note" required minLength={10} maxLength={500} rows={2} /></Field></>}
    {effectiveAction === "SCHEDULE" && <><Field label="Operador da mesma origem de dados"><select name="partnerId" required><option value="">Escolha operador compatível</option>{partners.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name} · conferir até {date(p.reviewExpiresAt)}</option>)}</select></Field><Field label="Processo (o servidor confere compatibilidade)"><select name="method"><Options labels={METHOD_LABEL} /></select></Field><DateField name="scheduledAt" label="Data planejada da coleta" future={3600000} /><Field label="Justificativa da rota escolhida"><textarea name="reason" required minLength={10} maxLength={500} rows={2} /></Field></>}
    {(effectiveAction === "COLLECT" || evidence) && <><Field label={`${evidence ? "Massa de entrada coberta pelo documento" : "Quantidade desta coleta"} · saldo ${number(Math.max(0,maximum))} kg`}><input name="weightKg" type="number" required min="0.001" step="0.001" max={Math.round(maximum * 1000) / 1000} inputMode="decimal" /></Field><DateField name="eventAt" label={effectiveAction === "COLLECT" ? "Data da coleta" : effectiveAction === "RECEIPT" ? "Data do recebimento declarado" : "Data da destinação declarada"} />{effectiveAction === "COLLECT" ? <Field label="Responsável pela coleta"><input name="receivedBy" required minLength={3} maxLength={120} /></Field> : <><Field label="Referência do documento"><input name="documentReference" required minLength={3} maxLength={180} /></Field><Field label="Conferente do documento"><input name="reviewedBy" required minLength={3} maxLength={120} /></Field><Field label="PDF, PNG ou JPEG · até 2 MiB"><input name="file" type="file" required accept="application/pdf,image/png,image/jpeg" /></Field></>}</>}
    {effectiveAction === "CANCEL" && <Field label="Motivo do cancelamento (histórico preservado)"><textarea name="reason" required minLength={10} maxLength={500} rows={2} /></Field>}
  </div>{effectiveAction !== "CANCEL" && <Attest text={evidence ? "Conferi o documento e a massa de entrada que ele comprova nesta etapa. Uma coleta não comprova tratamento." : "Conferi os dados desta etapa e assumo a declaração humana registrada na auditoria."} />}
    <button className="btn primary" disabled={job.busy}>{job.busy ? "Registrando…" : evidence ? "Anexar e registrar comprovação" : "Registrar etapa"}</button>{job.error && <p role="alert" className="cur-error">{job.error}</p>}
  </form></div>;
}
function Detail({ id, partners, changed }: { id: string; partners: CircularSnapshot["partners"]; changed(): Promise<void> }) {
  const [state, setState] = useState<{ data: CircularDetail | null; error: string }>({ data: null, error: "" });
  const load = useCallback(async () => { try { const data = await request(`/api/circular/batches/${id}`,"GET"); setState({ data, error: "" }); } catch (e) { setState(s => ({ ...s, error: e instanceof Error ? e.message : "Falha na consulta" })); } }, [id]);
  useEffect(() => { let alive = true; void request(`/api/circular/batches/${id}`,"GET").then(data => { if (alive) setState({ data, error: "" }); }).catch(e => { if (alive) setState({ data: null, error: String(e.message) }); }); return () => { alive = false; }; }, [id]);
  const d = state.data; const done = async () => { await load(); await changed(); };
  return <section className="cur-panel cur-detail" aria-label="Detalhes do lote">{state.error && <p role="alert" className="cur-error">{state.error}</p>}{!d ? <p>{state.error ? "Lote indisponível nesta consulta." : "Consultando o lote…"}</p> : <>
    <button className="btn" onClick={() => void load()}><RefreshCw size={15} />Atualizar lote</button><header><div><p className="cur-eyebrow">{d.source === "SIMULATED" ? "SIMULADO" : "REGISTRO MANUAL"} · {d.site.name}</p><h2>{d.description}</h2><p>{STATUS_LABEL[d.status]} · pesagem {date(d.occurredAt)}</p></div><strong>{number(d.weightKg)} kg</strong></header>
    <p className="cur-note">{ORIGIN_LABEL[d.origin]} · {MATERIAL_LABEL[d.material]} · motivo: {d.reason}</p>{d.reviewNote && <p>Triagem: {d.reviewNote} · {d.reviewedBy}</p>}
    {d.status !== "DONATION_REFERRED" && d.status !== "CANCELLED" && <div className="cur-mass"><span>Coletado <b>{number(d.collectedKg)} kg</b></span><span>Recebido documentado <b>{number(d.receivedKg)} kg</b></span><span>Destinação comprovada <b>{number(d.confirmedKg)} kg</b></span><span>Sem comprovação final <b>{number(Math.max(0,d.weightKg - d.confirmedKg))} kg</b></span></div>}
    {d.method && <p><b>{METHOD_LABEL[d.method]}</b> · {String((d.partnerSnapshot as Record<string, unknown> | null)?.name ?? "operador cadastrado")} · {d.scheduledAt ? `coleta planejada: ${date(d.scheduledAt)}` : ""}</p>}
    {d.donationBatchId && <p className="cur-note"><Link href="/doacoes">Abrir Doações</Link> · vínculo {d.donationBatchId} · candidato à verificação, sem liberação automática.</p>}
    <ActionForm key={d.version} item={d} partners={partners} done={done} />
    <h3>Documentos e conferência</h3>{!d.evidence.length ? <p className="cur-note">Nenhum comprovante anexado. Coleta ou cadastro não prova tratamento.</p> : <ul className="cur-documents">{d.evidence.map(e => <li key={e.id}><div><b>{EVIDENCE_LABEL[e.kind]} · {number(e.weightKg)} kg</b><p>{e.documentReference} · {date(e.eventAt)} · conferido por {e.reviewedBy}</p><small>SHA256 {e.sha256}</small></div><a className="btn" href={`/api/circular/evidence/${e.id}`}><Download size={14} />Baixar anexo</a></li>)}</ul>}
    <details><summary>Trilha de auditoria · {d.timeline.length} registros exibidos (até 300)</summary><ol className="cur-timeline">{d.timeline.map(t => <li key={t.id}>{date(t.at)} · {t.action.replaceAll("_"," ")} · {String((t.metadata as Record<string, unknown>)?.actor ?? "operador")}</li>)}</ol></details>
  </>}</section>;
}
function Scenario() {
  const [daily, setDaily] = useState(5), [days, setDays] = useState(26), [reduction, setReduction] = useState(50);
  const total = Math.max(0,daily) * Math.max(0,days), avoided = total * Math.min(100,Math.max(0,reduction)) / 100;
  return <details className="cur-panel cur-scenario"><summary>Cenário ilustrativo de prevenção · não grava dados</summary><p>Hipótese, sem resultado comprovado e sem entrada nos indicadores acima.</p><div className="cur-form-grid"><Field label="Kg/dia"><input type="number" min="0" max="100000" value={daily} onChange={e => setDaily(Number(e.target.value))} /></Field><Field label="Dias de operação/mês"><input type="number" min="0" max="31" value={days} onChange={e => setDays(Math.min(31,Number(e.target.value)))} /></Field><Field label="Redução hipotética (%)"><input type="number" min="0" max="100" value={reduction} onChange={e => setReduction(Number(e.target.value))} /></Field></div><p><b>{number(total)} kg/mês</b> na linha de base ilustrativa · <b>{number(avoided)} kg</b> potencialmente evitados · <b>{number(total - avoided)} kg</b> restantes para avaliar. Destinação real comprovada por este cenário: nenhuma.</p></details>;
}
export function CircularWorkspace({ enabled, initialSource = "MANUAL", initialId = null }: { enabled: boolean; initialSource?: Source; initialId?: string | null }) {
  const [source, setSource] = useState<Source>(initialSource), [range, setRange] = useState<Range>("30d"), [selected, setSelected] = useState<string | null>(initialId);
  const filterKey = `${source}:${range}`, sequence = useRef(0);
  const [state, setState] = useState<{ key: string; data: CircularSnapshot | null; error: string }>({ key: "", data: null, error: "" });
  const refresh = useCallback(async () => { if (!enabled) return; const n = ++sequence.current; try { const data = await request(`/api/circular?source=${source}&range=${range}`,"GET"); if (n === sequence.current) setState({ key: filterKey, data, error: "" }); } catch (e) { if (n === sequence.current) setState(s => ({ key: filterKey, data: s.key === filterKey ? s.data : null, error: e instanceof Error ? e.message : "Consulta indisponível" })); } }, [enabled,source,range,filterKey]);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => { if (!document.hidden) void refresh(); },30000); return () => window.clearInterval(timer); }, [refresh]);
  const data = state.key === filterKey ? state.data : null;
  return <div className="cur-workspace"><header className="cur-heading"><div><span className="cur-eyebrow"><Recycle size={15} /> INTELIGÊNCIA OPERACIONAL · RASTREABILIDADE</span><h1>RICHARDS Circular</h1><p>Da sobra registrada à destinação documentada. Cada etapa tem responsável e quantidade própria.</p></div><span className={`cur-source${source === "SIMULATED" ? " sim" : ""}`}>{source === "SIMULATED" ? "SIMULADO" : "REGISTROS MANUAIS"}</span></header>
    <div className="cur-journey"><span><PackagePlus />Registrar</span><span><ClipboardCheck />Triagem humana</span><span><Truck />Coletar e receber</span><span><FileCheck2 />Comprovar destino</span></div>
    {!enabled ? <section className="cur-panel"><h2>Ativação pendente</h2><p>O módulo está desligado. A equipe deve revisar a migração aditiva e configurar CIRCULAR_ENABLED no ambiente de homologação antes de registrar dados.</p><p>Nenhuma quantidade de demonstração foi cadastrada automaticamente.</p></section> : <>
    <div className="cur-filters"><Field label="Origem dos registros"><select value={source} onChange={e => { setSource(e.target.value as Source); setSelected(null); }}><option value="MANUAL">Manuais · operação</option><option value="SIMULATED">Simulados · ensaio</option></select></Field><Field label="Coorte de cadastro"><select value={range} onChange={e => setRange(e.target.value as Range)}><option value="24h">Últimas 24 horas</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option></select></Field><button className="btn" onClick={() => void refresh()}><RefreshCw size={15} />Atualizar</button></div>
    {state.key === filterKey && state.error && <p role="alert" className="cur-error">{state.error}{data ? ` · dados da consulta de ${date(data.generatedAt)}` : " · indicadores indisponíveis"}</p>}
    {!data ? <p className="cur-note">{state.error ? "Sem números disponíveis." : "Consultando registros…"}</p> : <>
      <div className="cur-kpis">{[["Resíduo declarado",data.kpis.residueKg],["Coleta registrada",data.kpis.collectedKg],["Recebimento documentado",data.kpis.receivedKg],["Tratamento orgânico comprovado",data.kpis.organicConfirmedKg],["Rejeito com disposição comprovada",data.kpis.disposalConfirmedKg],["Sem comprovação final",data.kpis.unprovenKg]].map(([label,value]) => <article key={String(label)}><span>{label}</span><strong>{number(Number(value))}<small> kg</small></strong></article>)}</div>
      <p className="cur-note">{data.filter.basis}. {date(data.filter.from)} a {date(data.filter.to)} · {data.kpis.awaitingTriage} aguardando triagem · {data.kpis.donationCandidates} encaminhados à triagem de doação. Coleta ≠ recebimento ≠ tratamento. Não há estimativa de economia ou CO₂ nestes indicadores.</p>
      <div className="cur-columns"><section className="cur-panel"><h2><PackagePlus size={19} />Registrar sobra</h2><NewBatch key={source} sites={data.sites} source={source} done={async id => { await refresh(); setSelected(id); }} /></section>
      <section className="cur-panel"><h2><Leaf size={19} />Operadores e compatibilidade</h2><p className="cur-note">Conferência humana declarada; não há validação automática de licença. Operadores simulados só recebem lotes simulados.</p><details><summary>Cadastrar operador · {source === "SIMULATED" ? "SIMULADO" : "MANUAL"}</summary><PartnerForm key={source} source={source} done={refresh} /></details><ul className="cur-partners">{data.partners.map(p => <li key={p.id}><b>{p.name}</b><span>{p.city} · {p.active ? "cadastrado" : "inativo"} · revisar até {date(p.reviewExpiresAt)}</span><span>{p.methods.map(m => METHOD_LABEL[m]).join(" · ")}</span><details><summary>Nova conferência cadastral</summary><PartnerForm source={source} initial={p} done={refresh} /></details>{p.active && <button className="btn" onClick={() => { void request("/api/circular/partners","PATCH",{ id:p.id,active:false }).then(refresh).catch(e => setState(s => ({...s,error:e.message}))); }}>Desativar para novas coletas</button>}</li>)}</ul>{!data.partners.length && <p>Nenhum operador cadastrado nesta origem.</p>}</section></div>
      <section className="cur-panel"><h2>Lotes e andamento</h2><p className="cur-note">{data.count} registros no recorte · exibidos até {data.limit}. Quantidades parciais permanecem em aberto até serem documentadas.</p><div className="cur-batch-list">{data.batches.map(b => <button className="cur-batch" key={b.id} aria-pressed={selected === b.id} onClick={() => setSelected(b.id)}><span><b>{b.description}</b><small>{b.site.name} · {STATUS_LABEL[b.status]}</small></span><span><b>{number(b.weightKg)} kg</b><small>{number(b.confirmedKg)} kg com destino comprovado</small></span></button>)}</div>{!data.count && <p>Sem registros neste recorte. Os 5 kg do cenário abaixo não entram aqui.</p>}</section>
      {selected && <Detail key={selected} id={selected} partners={data.partners} changed={refresh} />}
    </>}
    </>}
    <Scenario /><p className="cur-note">A decisão sobre consumo humano e compatibilidade ambiental é humana. O sistema organiza declarações, documentos e auditoria; não certifica segurança sanitária nem tratamento físico.</p>
  </div>;
}
