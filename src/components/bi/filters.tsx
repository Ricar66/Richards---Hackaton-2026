"use client";
import { useEffect, useRef, useState } from "react";
import { CalendarRange, Check, Link2, LoaderCircle } from "lucide-react";
import type { DashboardDTO } from "@/modules/analytics/domain/dashboard";
import { tzOffsetMs } from "@/modules/analytics/domain/analytics-filter";
import { dateBR, dayBR, hourBR } from "@/lib/format";
import { useShell } from "./shell";

const RANGES = [["24h", "24 h"], ["7d", "7 dias"], ["30d", "30 dias"]] as const;
const SOURCES = [["ALL", "Todas"], ["DEVICE", "Sensor"], ["SIMULATED", "Simulado"], ["MANUAL", "Manual"]] as const;
const BUCKET_TEXT = { "15m": "intervalos de 15 min", "1h": "intervalos de 1 h", "1d": "intervalos de 1 dia" } as const;
const BUCKET_SHORT = { "15m": "a cada 15 min", "1h": "por hora", "1d": "por dia" } as const;

/** `datetime-local` é interpretado no relógio de São Paulo, independentemente do fuso do navegador. */
function spLocalToIso(v: string) {
  const [d, t] = v.split("T"); const [y, m, day] = d.split("-").map(Number); const [h, mi] = t.split(":").map(Number);
  const asUtc = Date.UTC(y, m - 1, day, h, mi);
  return new Date(asUtc - tzOffsetMs(new Date(asUtc))).toISOString();
}
const isoToSpLocal = (iso: string) => { const d = new Date(iso); return new Date(d.getTime() + tzOffsetMs(d)).toISOString().slice(0, 16); };

function CustomRange({ data, onClose }: { data: DashboardDTO; onClose: () => void }) {
  const { setFilter } = useShell();
  const [from, setFrom] = useState(isoToSpLocal(data.filter.from));
  const [to, setTo] = useState(isoToSpLocal(data.filter.to));
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    box.current?.querySelector("input")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) closeRef.current(); };
    document.addEventListener("keydown", onKey); document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, []);
  const valid = from && to && from < to;
  return <div className="range-pop" ref={box} role="dialog" aria-label="Período personalizado">
    <label>Início<input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} /></label>
    <label>Fim<input type="datetime-local" value={to} onChange={e => setTo(e.target.value)} /></label>
    <p>Horário de Brasília · até 92 dias · fim no futuro é cortado em agora.</p>
    <div className="btn-row">
      <button className="btn ghost" onClick={onClose}>Cancelar</button>
      <button className="btn primary" disabled={!valid} onClick={() => { setFilter({ range: null, from: spLocalToIso(from), to: spLocalToIso(to) }); onClose(); }}>Aplicar período</button>
    </div>
  </div>;
}

/** Uma barra de filtros acima de tudo o que ela recorta; o estado vive na URL. */
export function GlobalFilters({ data, showDevice = true }: { data: DashboardDTO; showDevice?: boolean }) {
  const { setFilter, pending, toast } = useShell();
  const [custom, setCustom] = useState(false);
  const f = data.filter;
  const devices = data.options.devices.filter(d => !f.siteId || d.siteId === f.siteId);

  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.href); toast({ tone: "ok", title: "Link da investigação copiado", body: "Quem abrir verá o mesmo período, sensor e origem." }); }
    catch { toast({ tone: "warn", title: "Não foi possível copiar", body: "Copie o endereço da barra do navegador." }); }
  }

  return <div className="filters" role="region" aria-label="Filtros globais">
    <div className="seg" role="group" aria-label="Período">
      {RANGES.map(([k, label]) => <button key={k} aria-pressed={f.range === k} onClick={() => setFilter({ range: k === "7d" ? null : k, from: null, to: null })}>{label}</button>)}
      <button aria-pressed={f.range === "custom"} onClick={() => setCustom(c => !c)} aria-expanded={custom}><CalendarRange size={14} /> Personalizado</button>
      {custom && <CustomRange data={data} onClose={() => setCustom(false)} />}
    </div>
    {data.options.sites.length > 1 && <label className="select">
      <span className="sr-only">Unidade</span>
      <select value={f.siteId ?? ""} onChange={e => setFilter({ siteId: e.target.value || null, deviceId: null })}>
        <option value="">Todas as unidades</option>
        {data.options.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>}
    {showDevice && <label className="select">
      <span className="sr-only">Sensor</span>
      <select value={f.deviceId ?? ""} onChange={e => setFilter({ deviceId: e.target.value || null })}>
        <option value="">Todos os sensores</option>
        {devices.map(d => <option key={d.id} value={d.id}>{d.code} · {d.label}</option>)}
      </select>
    </label>}
    <div className="seg" role="group" aria-label="Origem dos dados">
      {SOURCES.map(([k, label]) => <button key={k} aria-pressed={f.source === k} onClick={() => setFilter({ source: k === "ALL" ? null : k })}>{label}</button>)}
    </div>
    <div className="filters-meta">
      {pending ? <span className="pending" role="status"><LoaderCircle size={14} className="spin" /> Atualizando recorte…</span>
        : <span title={`${dateBR(f.from)} → ${dateBR(f.to)} · ${BUCKET_TEXT[f.bucket]}`}>{dayBR(f.from)} {hourBR(f.from)} → {f.range === "custom" ? `${dayBR(f.to)} ${hourBR(f.to)}` : `agora ${hourBR(f.to)}`} · {BUCKET_SHORT[f.bucket]}</span>}
      <button className="icon-btn" onClick={() => void copyLink()} title="Copiar link desta investigação" aria-label="Copiar link desta investigação"><Link2 size={15} /></button>
    </div>
    {f.range === "custom" && !custom && <button className="chip-reset" onClick={() => setFilter({ from: null, to: null, range: null })}><Check size={13} /> Voltar para 7 dias</button>}
  </div>;
}
