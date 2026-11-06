"use client";
import { useEffect, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CheckCircle2, Eye, X, XCircle } from "lucide-react";
import type { OccurrenceDetailDTO } from "@/modules/monitoring/application/get-occurrence-detail";
import { dateBR, numBR, timeBR } from "@/lib/format";
import { AXIS_TICK, CHART, CONNECTIVITY_LABEL, FLOW, FLOW_AVG, KIND_LABEL, SEVERITY_COLOR, SEVERITY_LABEL, STATUS_LABEL, STATUS_TONE, TIP_STYLE } from "./labels";
import { Seal, Tag } from "./primitives";
import { useLiveVersion } from "./live-stream";

const actionLabel: Record<string, string> = { CREATED: "Ocorrência aberta", ACKNOWLEDGED: "Investigação assumida", RESOLVED: "Resolvida", DISMISSED: "Descartada", COMMUNICATION_RESTORED: "Comunicação restabelecida" };
const VISIBLE_READINGS = 8;

async function fetchDetail(id: string): Promise<{ ok: true; detail: OccurrenceDetailDTO } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/occurrences/${encodeURIComponent(id)}`, { cache: "no-store" });
    const body = await res.json();
    return res.ok ? { ok: true, detail: body as OccurrenceDetailDTO } : { ok: false, error: body.error || "Falha ao carregar a ocorrência" };
  } catch { return { ok: false, error: "Sem conexão com o servidor" }; }
}

/** Gráfico da evidência: leituras que a regra avaliou + o que veio depois (a vazão caiu após a intervenção?). */
function EvidenceChart({ ev }: { ev: NonNullable<OccurrenceDetailDTO["evidence"]> }) {
  const rows = [
    ...ev.readings.map(r => ({ t: new Date(r.at).getTime(), janela: r.flowLpm, depois: null as number | null })),
    ...ev.followUp.map(r => ({ t: new Date(r.at).getTime(), janela: null as number | null, depois: r.flowLpm })),
  ];
  // Liga visualmente a última leitura da janela à primeira de depois, sem inventar ponto.
  if (ev.readings.length && ev.followUp.length) rows[ev.readings.length - 1].depois = rows[ev.readings.length - 1].janela;
  const ws = new Date(ev.windowStart).getTime(), we = new Date(ev.windowEnd).getTime();
  return <figure className="evidence-chart" aria-label="Vazão das leituras de evidência">
    <div className="mini-legend"><span><i style={{ background: FLOW }} />Janela avaliada pela regra</span>{ev.followUp.length > 0 && <span><i style={{ background: FLOW_AVG }} />Depois da abertura</span>}{ev.rule && <span><i className="dash" />Limiar {numBR(ev.rule.minFlowLpm, 2)} L/min</span>}</div>
    <ResponsiveContainer width="100%" height={170}>
      <LineChart data={rows} margin={{ top: 8, right: 10, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={t => timeBR(new Date(t)).slice(0, 5)} tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={30} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} tickFormatter={v => numBR(v, 1)} />
        <ReferenceArea x1={ws} x2={we} fill={FLOW} fillOpacity={0.1} />
        {ev.rule && <ReferenceLine y={ev.rule.minFlowLpm} stroke={CHART.threshold} strokeDasharray="5 4" />}
        <Tooltip labelFormatter={t => timeBR(new Date(Number(t)))} formatter={(v, n) => [`${numBR(Number(v), 2)} L/min`, n === "janela" ? "Na janela" : "Depois"]} contentStyle={TIP_STYLE} />
        <Line dataKey="janela" stroke={FLOW} strokeWidth={2} dot={{ r: 2.5, fill: FLOW, stroke: FLOW }} isAnimationActive={false} connectNulls={false} />
        <Line dataKey="depois" stroke={FLOW_AVG} strokeWidth={2} dot={{ r: 2, fill: FLOW_AVG, stroke: FLOW_AVG }} isAnimationActive={false} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  </figure>;
}

/** Evidência e ações vêm sempre do servidor: nada de timeline ilustrativa nem estado alterado só no navegador. */
export function OccurrenceDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
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
  // Ao vivo: outra tela mudou o estado desta ocorrência, ou chegou leitura do mesmo sensor e origem enquanto ela está ativa
  // ("Depois da abertura" cresce). Sempre refaz a busca no servidor; nada é desenhado a partir do evento.
  const liveVersion = useLiveVersion(["occurrence.status", "reading.created"], e => e.type === "occurrence.status" ? e.id === id
    : !!detail?.device && e.deviceId === detail.device.id && e.source === detail.source && (detail.status === "OPEN" || detail.status === "ACKNOWLEDGED"), { gap: 3000 });
  useEffect(() => {
    let alive = true;
    fetchDetail(id).then(r => {
      if (!alive) return;
      if (r.ok) { setDetail(r.detail); setLoadError(""); } else setLoadError(r.error);
    });
    return () => { alive = false; };
  }, [id, version, liveVersion]);

  // Teclado: foco entra no painel, Escape fecha e o foco volta para quem abriu.
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
      const res = await fetch(`/api/occurrences/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, note: note.trim() }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Operação recusada");
      setNote(""); setVersion(v => v + 1); onChanged();
    } catch (e) { setActionError(e instanceof Error ? e.message : "Falha na operação"); }
    finally { setBusy(false); }
  }

  const d = detail;
  const active = d ? d.status === "OPEN" || d.status === "ACKNOWLEDGED" : false;
  const noteOk = note.trim().length >= 5;
  const ev = d?.evidence;
  const lastFollow = ev?.followUp[ev.followUp.length - 1];
  return <div className="drawer-scrim" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="occ-title" tabIndex={-1} ref={panel}>
      <header className="drawer-head">
        <div>
          <span className="eyebrow">Ocorrência{d ? ` · ${KIND_LABEL[d.kind] ?? d.kind}` : ""}</span>
          <h2 id="occ-title">{d?.title ?? "Carregando…"}</h2>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Fechar detalhe"><X size={17} /></button>
      </header>
      {loadError && <p role="alert" className="form-error">{loadError}</p>}
      {!d && !loadError && <div className="drawer-loading" role="status"><span className="sk" /><span className="sk" /><span className="sk short" /></div>}
      {d && <div className="drawer-body">
        {/* Estado é etiqueta; severidade é texto com ponto; origem é selo (forma diferente, não mais uma pílula). */}
        <div className="tag-row">
          <Tag tone={STATUS_TONE[d.status as keyof typeof STATUS_TONE] ?? "neutral"}>{STATUS_LABEL[d.status as keyof typeof STATUS_LABEL] ?? d.status}</Tag>
          <span className="sev-text"><span className="sev-dot" style={{ background: SEVERITY_COLOR[d.severity as keyof typeof SEVERITY_COLOR] ?? CHART.tick }} aria-hidden="true" />Severidade {(SEVERITY_LABEL[d.severity as keyof typeof SEVERITY_LABEL] ?? d.severity).toLowerCase()}</span>
          <Seal source={d.source} />
        </div>
        <p className="muted-text">{d.description}</p>
        <dl className="facts">
          <div><dt>Sensor</dt><dd>{d.device ? <>{d.device.code}<small>{CONNECTIVITY_LABEL[d.device.connectivity]}</small></> : "—"}</dd></div>
          <div><dt>Volume suspeito na janela</dt><dd>{d.suspectedLiters !== null ? `${numBR(d.suspectedLiters, 2)} L` : "—"}</dd></div>
          <div><dt>Aberta em</dt><dd>{dateBR(d.openedAt)}</dd></div>
          <div><dt>Encerrada em</dt><dd>{d.resolvedAt ? dateBR(d.resolvedAt) : "—"}</dd></div>
        </dl>

        <h3 className="drawer-section">Evidência</h3>
        <p className="muted-text">{d.evidenceNote}</p>
        {ev && <>
          <EvidenceChart ev={ev} />
          <dl className="facts compact">
            <div><dt>Janela</dt><dd>{timeBR(new Date(ev.windowStart))} – {timeBR(new Date(ev.windowEnd))}</dd></div>
            <div><dt>Regra</dt><dd>{ev.rule ? `≥ ${numBR(ev.rule.minFlowLpm, 2)} L/min por ${ev.rule.continuousSeconds} s` : "—"}</dd></div>
            <div><dt>Amostras · volume · pico</dt><dd>{ev.totals.samples} · {numBR(ev.totals.liters, 3)} L · {numBR(ev.totals.maxFlowLpm, 2)} L/min</dd></div>
          </dl>
          <table className="mini-table">
            <caption className="sr-only">Leituras da janela que abriu o alerta</caption>
            <thead><tr><th scope="col">Hora</th><th scope="col">Vazão</th><th scope="col">Volume</th><th scope="col">Seq.</th></tr></thead>
            <tbody>{ev.readings.slice(-VISIBLE_READINGS).map(r => <tr key={`${r.bootId}:${r.sequence}`}><td>{timeBR(new Date(r.at))}</td><td>{numBR(r.flowLpm, 2)} L/min</td><td>{numBR(r.deltaLiters, 3)} L</td><td>{r.sequence}</td></tr>)}</tbody>
          </table>
          {ev.readings.length > VISIBLE_READINGS && <p className="muted-text small">Mostrando as {VISIBLE_READINGS} últimas de {ev.readings.length} leituras da janela.</p>}
          <p className="muted-text small">Depois da abertura{d.resolvedAt ? " (até o encerramento)" : ""}: {ev.followUp.length} leitura(s){lastFollow ? `; a última, às ${timeBR(new Date(lastFollow.at))}, marcou ${numBR(lastFollow.flowLpm, 2)} L/min` : ""}.</p>
        </>}

        <h3 className="drawer-section">Linha do tempo</h3>
        {d.timeline.length
          ? <ol className="timeline">{d.timeline.map((e, i) => <li key={i} className={`tl-${e.action.toLowerCase()}`}><b>{actionLabel[e.action] ?? e.action}</b><span>{dateBR(e.at)} · {e.actor ?? "autor não registrado"}</span>{e.note && <q>{e.note}</q>}</li>)}</ol>
          : <p className="muted-text">Nenhum evento registrado (ocorrência inicial do seed de demonstração, criada sem trilha).</p>}

        {active && <div className="drawer-actions">
          {d.status === "OPEN" && <button className="btn" disabled={busy} onClick={() => void act("ACKNOWLEDGED")}><Eye size={15} /> Assumir investigação</button>}
          <label htmlFor="occ-note" className="field-label">Verificação e ação tomada</label>
          <textarea id="occ-note" value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={500} placeholder="Ex.: registro da linha 01 fechado; vazão zerou às 14:20." />
          <div className="btn-row">
            <button className="btn primary" disabled={busy || !noteOk} onClick={() => void act("RESOLVED")}><CheckCircle2 size={15} /> Resolver</button>
            <button className="btn" disabled={busy || !noteOk} onClick={() => void act("DISMISSED")}><XCircle size={15} /> Descartar (falso alarme)</button>
          </div>
          {!noteOk && <p className="muted-text small">Resolver ou descartar exige descrever a verificação (mínimo de 5 caracteres).</p>}
          {actionError && <p role="alert" className="form-error">{actionError}</p>}
        </div>}
        {!active && d.verificationNote && <div className="final-note"><span>Registro final</span><p>{d.verificationNote}</p></div>}
        <p className="muted-text small disclaimer">Ocorrência de sensor indica fluxo fora do padrão configurado; não equivale a vazamento confirmado.</p>
      </div>}
    </div>
  </div>;
}
