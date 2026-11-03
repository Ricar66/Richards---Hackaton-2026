"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Activity, Bell, ChevronRight, Cpu, Droplets, FileChartColumn, HeartHandshake, LayoutDashboard, Menu, Radar, TriangleAlert, X } from "lucide-react";
import type { LiveDTO } from "@/modules/analytics/domain/dashboard";
import { agoBR, hourBR, numBR } from "@/lib/format";
import { DATA_CHANGED, notifyDataChanged, useNow } from "./hooks";
import { SEVERITY_COLOR, SOURCE_LABEL, STATUS_LABEL } from "./labels";
import { OccurrenceDrawer } from "./occurrence-drawer";
import { IntervalDrawer, type IntervalRequest } from "./interval-drawer";

const NAV = [
  { href: "/", label: "Centro de controle", Icon: LayoutDashboard },
  { href: "/monitoramento", label: "Monitoramento hídrico", Icon: Activity },
  { href: "/ocorrencias", label: "Ocorrências", Icon: TriangleAlert },
  { href: "/doacoes", label: "Doações & impacto", Icon: HeartHandshake },
  { href: "/relatorios", label: "Relatórios", Icon: FileChartColumn },
  { href: "/dispositivos", label: "Dispositivos IoT", Icon: Cpu },
] as const;
/** Parâmetros que não são filtro (não viajam entre telas nem vão para a API). */
const NON_FILTER = ["oc"];

type Toast = { id: number; title: string; body?: string; tone: "info" | "warn" | "ok"; action?: { label: string; run: () => void } };
type Ctx = {
  pending: boolean;
  params: URLSearchParams;
  setFilter: (patch: Record<string, string | null>) => void;
  openOccurrence: (id: string) => void;
  openInterval: (req: IntervalRequest) => void;
  toast: (t: Omit<Toast, "id">) => void;
  live: LiveDTO | null;
  liveError: boolean;
};
const ShellCtx = createContext<Ctx | null>(null);
export function useShell() {
  const ctx = useContext(ShellCtx);
  if (!ctx) throw new Error("useShell fora do BiShell");
  return ctx;
}

const LIVE_MS = 5_000;
const SIGNAL_FRESH_MS = 120_000;

function useLive(onNew: (items: LiveDTO["active"]) => void) {
  const [live, setLive] = useState<LiveDTO | null>(null);
  const [error, setError] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const onNewRef = useRef(onNew);
  useEffect(() => { onNewRef.current = onNew; });
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/analytics/live", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json() as LiveDTO;
        if (!alive) return;
        // Primeira leitura só registra o que já existia: aviso é para o que surgir com a tela aberta.
        if (seen.current) { const fresh = body.active.filter(o => !seen.current!.has(o.id)); if (fresh.length) onNewRef.current(fresh); }
        seen.current = new Set([...(seen.current ?? []), ...body.active.map(o => o.id)]);
        setLive(body); setError(false);
      } catch { if (alive) setError(true); }
    };
    const timer = window.setInterval(poll, LIVE_MS);
    const first = window.setTimeout(poll, 0);
    window.addEventListener(DATA_CHANGED, poll);
    return () => { alive = false; window.clearInterval(timer); window.clearTimeout(first); window.removeEventListener(DATA_CHANGED, poll); };
  }, []);
  return { live, error };
}

function LivePill({ live, error }: { live: LiveDTO | null; error: boolean }) {
  const now = useNow();
  if (error) return <span className="live-pill down" role="status"><i /> Servidor indisponível · números parados</span>;
  if (!live) return <span className="live-pill idle"><i /> Conectando ao sinal…</span>;
  const r = live.lastReading;
  if (!r) return <span className="live-pill idle"><i /> Nenhuma leitura recebida ainda</span>;
  const at = new Date(r.at).getTime();
  const fresh = now !== null && now - at <= SIGNAL_FRESH_MS;
  return <span className={`live-pill ${fresh ? "on" : "stale"}`} title={`Última leitura ${hourBR(at)} · ${r.deviceCode} · origem ${SOURCE_LABEL[r.source]} · consulta a cada 5 s (não é streaming)`}>
    <i />
    {fresh ? <>Sinal {r.source === "SIMULATED" ? "simulado" : "do sensor"} · <b>{numBR(r.flowLpm, 2)} L/min</b></> : <>Sem sinal novo · última leitura {hourBR(at)}</>}
    <span className="live-ago">{now === null ? hourBR(at) : agoBR(at, now)}</span>
  </span>;
}

function AlertMenu({ live, onOpen }: { live: LiveDTO | null; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const count = live?.activeCount ?? 0;
  return <div className="alert-menu" ref={box}>
    <button className="icon-btn" aria-label={`Ocorrências ativas: ${count}`} aria-expanded={open} onClick={() => setOpen(o => !o)}>
      <Bell size={17} />{count > 0 && <span className="bell-count">{count}</span>}
    </button>
    {open && <div className="alert-pop" role="menu">
      <div className="alert-pop-head">Ocorrências ativas <b>{count}</b></div>
      {live?.active.length ? live.active.map(o => <button role="menuitem" key={o.id} className="alert-item" onClick={() => { setOpen(false); onOpen(o.id); }}>
        <span className="sev-dot" style={{ background: SEVERITY_COLOR[o.severity] }} />
        <span><b>{o.title}</b><small>{STATUS_LABEL[o.status]} · {SOURCE_LABEL[o.source]} · {hourBR(o.openedAt)}</small></span>
      </button>) : <p className="alert-empty">Nenhuma ocorrência aberta ou em análise.</p>}
      <Link href="/ocorrencias" className="alert-all" onClick={() => setOpen(false)}>Abrir central de ocorrências <ChevronRight size={14} /></Link>
    </div>}
  </div>;
}

export function BiShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [navOpen, setNavOpen] = useState(false);
  const [occurrenceId, setOccurrenceId] = useState<string | null>(() => search.get("oc"));
  const [interval, setIntervalReq] = useState<IntervalRequest | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const params = useMemo(() => { const p = new URLSearchParams(search.toString()); NON_FILTER.forEach(k => p.delete(k)); return p; }, [search]);
  const filterQuery = params.toString();

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = nextId.current++;
    setToasts(xs => [...xs.slice(-3), { ...t, id }]);
    window.setTimeout(() => setToasts(xs => xs.filter(x => x.id !== id)), t.action ? 12_000 : 5_000);
  }, []);

  const setFilter = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === "") next.delete(k); else next.set(k, v); }
    const q = next.toString();
    startTransition(() => router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false }));
  }, [params, pathname, router]);

  // A ocorrência aberta fica na URL (?oc=) para a investigação poder ser compartilhada.
  const syncOc = (id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("oc", id); else url.searchParams.delete("oc");
    window.history.replaceState(window.history.state, "", url);
  };
  const openOccurrence = useCallback((id: string) => { setIntervalReq(null); setOccurrenceId(id); syncOc(id); }, []);
  const closeOccurrence = useCallback(() => { setOccurrenceId(null); syncOc(null); }, []);

  const { live, error: liveError } = useLive(items => {
    for (const o of items) toast({ tone: "warn", title: `Nova ocorrência · ${o.title}`, body: `${SOURCE_LABEL[o.source]} · aberta às ${hourBR(o.openedAt)}`, action: { label: "Investigar", run: () => openOccurrence(o.id) } });
    notifyDataChanged();
  });

  const ctx = useMemo<Ctx>(() => ({ pending, params, setFilter, openOccurrence, openInterval: setIntervalReq, toast, live, liveError }), [pending, params, setFilter, openOccurrence, toast, live, liveError]);
  const current = NAV.find(n => n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)) ?? NAV[0];

  return <ShellCtx.Provider value={ctx}>
    <div className="app">
      <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>
      <div className={`nav-scrim ${navOpen ? "show" : ""}`} onClick={() => setNavOpen(false)} />
      <aside className={`side ${navOpen ? "open" : ""}`} aria-label="Navegação principal">
        <div className="brand">
          <span className="brand-mark"><Droplets size={19} /></span>
          <span><b>RICHARDS</b><small>Intelligence</small></span>
          <button className="icon-btn side-close" onClick={() => setNavOpen(false)} aria-label="Fechar menu"><X size={17} /></button>
        </div>
        <nav className="side-nav">
          <span className="side-heading">Inteligência</span>
          {NAV.map(({ href, label, Icon }) => {
            const active = current.href === href;
            return <Link key={href} href={filterQuery ? `${href}?${filterQuery}` : href} className={`side-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => setNavOpen(false)}>
              <Icon size={17} /><span>{label}</span>
              {href === "/ocorrencias" && (live?.activeCount ?? 0) > 0 && <span className="side-count">{live!.activeCount}</span>}
            </Link>;
          })}
        </nav>
        <div className="side-foot">
          <div className="side-card">
            <Radar size={17} />
            <strong>Do sinal à ação</strong>
            <p>Leitura vira suspeita, suspeita vira verificação humana registrada.</p>
          </div>
          <a className="side-legacy" href="/intelligence">Abrir BI V3 legado (contingência)</a>
          <small>Hackathon Senac RP · 2026</small>
        </div>
      </aside>
      <div className="main-col">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setNavOpen(true)} aria-label="Abrir menu"><Menu size={18} /></button>
          <div className="crumb"><span>RICHARDS</span><ChevronRight size={13} /><strong>{current.label}</strong></div>
          <div className="top-actions">
            <LivePill live={live} error={liveError} />
            <AlertMenu live={live} onOpen={openOccurrence} />
            <span className="avatar" title="Operador autenticado (Basic Auth de laboratório)">OP</span>
          </div>
        </header>
        <main id="conteudo" className="page" aria-busy={pending}>{children}</main>
      </div>
    </div>
    {occurrenceId && <OccurrenceDrawer key={occurrenceId} id={occurrenceId} onClose={closeOccurrence} onChanged={() => { notifyDataChanged(); }} />}
    {interval && <IntervalDrawer request={interval} scope={filterQuery} onClose={() => setIntervalReq(null)} onOpenOccurrence={openOccurrence} />}
    <div className="toasts" aria-live="polite">
      {toasts.map(t => <div key={t.id} className={`toast ${t.tone}`} role="status">
        <div><b>{t.title}</b>{t.body && <small>{t.body}</small>}</div>
        {t.action && <button className="toast-action" onClick={() => { t.action!.run(); setToasts(xs => xs.filter(x => x.id !== t.id)); }}>{t.action.label}</button>}
        <button className="toast-x" aria-label="Dispensar aviso" onClick={() => setToasts(xs => xs.filter(x => x.id !== t.id))}><X size={13} /></button>
      </div>)}
    </div>
  </ShellCtx.Provider>;
}
