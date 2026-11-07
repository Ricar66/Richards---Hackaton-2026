"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bot, Activity, Bell, ChevronRight, Cpu, Droplets, ExternalLink, FileChartColumn, HeartHandshake, LayoutDashboard, Menu, MonitorPlay, TriangleAlert, X } from "lucide-react";
import { agoBR, hourBR, numBR } from "@/lib/format";
import { notifyDataChanged, PREVIEW_OUTDATED, PREVIEW_REFRESH, useNow, usePrefersReducedMotion } from "./hooks";
import { useLiveEvent, useLiveStream, useNewOccurrence, type LiveView } from "./live-stream";
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
  { href: "/assistente", label: "RICHARDS Assist", Icon: Bot },
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
};
const ShellCtx = createContext<Ctx | null>(null);
export function useShell() {
  const ctx = useContext(ShellCtx);
  if (!ctx) throw new Error("useShell fora do BiShell");
  return ctx;
}

const SIGNAL_FRESH_MS = 120_000;
const ORIGIN_SHORT = { DEVICE: "sensor", SIMULATED: "simulado", MANUAL: "manual" } as const;
/** Como a tela recebe os números agora (vai no title e no anúncio do leitor de tela, que só fala quando o estado muda). */
const MODE_TEXT: Record<LiveView, string> = {
  connecting: "Conectando ao sinal ao vivo",
  live: "Ao vivo: cada leitura gravada chega pelo stream",
  reconnecting: "Reconectando ao stream; enquanto isso, consulta a cada 5 s",
  polling: "Stream indisponível: consulta a cada 5 s",
  offline: "Servidor indisponível: números parados",
};

/** Pílula do sinal. `data-live-state` é o estado real da conexão (o E2E lê o mesmo atributo). */
function LivePill() {
  const { state, live } = useLiveStream();
  const now = useNow();
  const reduced = usePrefersReducedMotion();
  const dot = useRef<HTMLElement>(null);
  const prevAt = useRef<string | null>(null);
  const r = live?.lastReading ?? null;
  const at = r?.at ?? null;
  // Pisca UMA vez por leitura nova (não em loop); o primeiro retrato não pisca.
  useEffect(() => {
    const before = prevAt.current;
    prevAt.current = at;
    if (!before || !at || at === before || reduced || state !== "live") return;
    dot.current?.animate?.([{ boxShadow: "0 0 0 0 rgba(99, 235, 191, .6)" }, { boxShadow: "0 0 0 8px rgba(99, 235, 191, 0)" }], { duration: 900, easing: "ease-out" });
  }, [at, reduced, state]);

  const atMs = at ? new Date(at).getTime() : null;
  const ago = atMs === null ? null : <span className="live-ago">{now === null ? hourBR(atMs) : agoBR(atMs, now)}</span>;
  const title = r ? `Última leitura ${hourBR(r.at)} · ${r.deviceCode} · origem ${SOURCE_LABEL[r.source]} · ${MODE_TEXT[state]}` : MODE_TEXT[state];
  let tone = "idle", body: React.ReactNode;
  if (state === "offline") { tone = "down"; body = "Servidor indisponível · números parados"; }
  else if (state === "connecting") body = "Conectando ao sinal…";
  else if (state === "reconnecting") { tone = "stale"; body = <>Reconectando…{ago}</>; }
  else if (state === "polling") { tone = "stale"; body = <>Consulta a cada 5 s · stream indisponível{ago}</>; }
  else if (!live) { tone = "on"; body = "Ao vivo · carregando…"; }
  else if (!r || atMs === null) body = "Ao vivo · nenhuma leitura recebida ainda";
  else if (now !== null && now - atMs > SIGNAL_FRESH_MS) { tone = "stale"; body = <>Conectado · sem leitura nova desde {hourBR(atMs)}</>; }
  else { tone = "on"; body = <>Ao vivo · {ORIGIN_SHORT[r.source]} · <b>{numBR(r.flowLpm, 2)} L/min</b>{ago}</>; }
  return <>
    <span className={`live-pill ${tone}`} data-live-state={state} title={title}>
      {/* O ponto não fica pulsando: a animação em loop do CSS é desligada e ele pisca só quando chega leitura. */}
      <i ref={dot} style={{ animation: "none" }} />{body}
    </span>
    <span className="sr-only" role="status">{MODE_TEXT[state]}</span>
  </>;
}

/** Contador lateral de ativas (contagem do servidor). */
function SideCount() {
  const { live } = useLiveStream();
  return live && live.activeCount > 0 ? <span className="side-count">{live.activeCount}</span> : null;
}

const CHANNEL_TEXT: Record<LiveView, string> = {
  connecting: "Conectando…",
  live: "Stream ao vivo",
  reconnecting: "Reconectando · consulta a cada 5 s",
  polling: "Consulta a cada 5 s",
  offline: "Servidor indisponível",
};
const CHANNEL_TONE: Record<LiveView, string> = { connecting: "idle", live: "on", reconnecting: "stale", polling: "stale", offline: "down" };

/** Bloco "Sistema" da barra lateral: estado real do canal, última leitura gravada e contagem do servidor (nada calculado aqui). */
function SystemBlock({ onNavigate }: { onNavigate: () => void }) {
  const { state, live } = useLiveStream();
  const now = useNow();
  const r = live?.lastReading ?? null;
  const atMs = r ? new Date(r.at).getTime() : null;
  return <section className="side-sys" aria-labelledby="side-sys-h">
    <h2 id="side-sys-h">Sistema</h2>
    <dl>
      <div><dt>Canal</dt><dd><i className={`sys-dot ${CHANNEL_TONE[state]}`} aria-hidden="true" />{CHANNEL_TEXT[state]}</dd></div>
      <div><dt>Última leitura</dt><dd>{r && atMs !== null ? <>{now === null ? hourBR(atMs) : agoBR(atMs, now)}<small>{r.deviceCode} · <span className={`sys-src ${r.source.toLowerCase()}`}>{ORIGIN_SHORT[r.source]}</span></small></> : live ? "nenhuma ainda" : "—"}</dd></div>
      <div><dt>Ocorrências ativas</dt><dd className={live && live.activeCount > 0 ? "warn" : ""}>{live ? live.activeCount : "—"}</dd></div>
    </dl>
    <a className="btn side-stage" href="/ao-vivo" target="_blank" rel="noopener" onClick={onNavigate}>
      <MonitorPlay size={16} /> Abrir Sala ao vivo <ExternalLink size={13} aria-hidden="true" /><span className="sr-only">(abre em nova aba)</span>
    </a>
  </section>;
}

function AlertMenu({ onOpen }: { onOpen: (id: string) => void }) {
  const { live } = useLiveStream();
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

  // Avisos a partir do stream. Ocorrência: uma vez por id (o mesmo conjunto vale para o evento e para a consulta de reserva).
  useNewOccurrence(o => {
    toast({ tone: "warn", title: `Nova ocorrência · ${o.title}`, body: `${SOURCE_LABEL[o.source]} · aberta às ${hourBR(o.openedAt)}`, action: { label: "Investigar", run: () => openOccurrence(o.id) } });
    // Com o stream fora, as telas não receberam o evento: avisa para buscarem de novo.
    if (o.via === "snapshot") notifyDataChanged();
  });
  useLiveEvent("donation.created", e => {
    if (e.origin !== "scale") return;
    toast({ tone: "info", title: `Lote ${numBR(e.kg, 1)} kg aguardando verificação`, body: `Balança${e.deviceCode ? ` ${e.deviceCode}` : ""} · ${SOURCE_LABEL[e.source]} · só fica disponível depois da verificação humana`,
      action: { label: "Ver doações", run: () => router.push(filterQuery ? `/doacoes?${filterQuery}` : "/doacoes") } });
  });
  useEffect(() => {
    const onOutdated = () => toast({ tone: "info", title: "Há dados novos desde a prévia", body: "A prévia não muda sozinha, para continuar igual ao PDF.", action: { label: "Atualizar prévia", run: () => window.dispatchEvent(new Event(PREVIEW_REFRESH)) } });
    window.addEventListener(PREVIEW_OUTDATED, onOutdated);
    return () => window.removeEventListener(PREVIEW_OUTDATED, onOutdated);
  }, [toast]);

  const ctx = useMemo<Ctx>(() => ({ pending, params, setFilter, openOccurrence, openInterval: setIntervalReq, toast }), [pending, params, setFilter, openOccurrence, toast]);
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
          {NAV.map(({ href, label, Icon }, i) => {
            const active = current.href === href;
            // Direção do deslize pela ordem da barra: descer na lista avança, subir volta (a tela atual não anima).
            const at = NAV.indexOf(current);
            const types = i > at ? ["nav-forward"] : i < at ? ["nav-back"] : undefined;
            return <Link key={href} href={filterQuery ? `${href}?${filterQuery}` : href} transitionTypes={types} className={`side-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => setNavOpen(false)}>
              <Icon size={17} /><span>{label}</span>
              {href === "/ocorrencias" && <SideCount />}
            </Link>;
          })}
        </nav>
        <div className="side-foot">
          <SystemBlock onNavigate={() => setNavOpen(false)} />
          <a className="side-legacy" href="/intelligence">Abrir BI V3 legado (contingência)</a>
          <small>Hackathon Senac RP · 2026</small>
        </div>
      </aside>
      <div className="main-col">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setNavOpen(true)} aria-label="Abrir menu"><Menu size={18} /></button>
          <div className="crumb"><span>RICHARDS</span><ChevronRight size={13} /><strong>{current.label}</strong></div>
          <div className="top-actions">
            <LivePill />
            <AlertMenu onOpen={openOccurrence} />
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
