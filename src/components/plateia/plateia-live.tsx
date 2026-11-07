"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { AudienceReading, AudienceSource } from "@/modules/audience/public-feed";

type Kind<K extends AudienceReading["kind"]> = Extract<AudienceReading, { kind: K }>;
type Values = { flow: Kind<"flow"> | null; environment: Kind<"environment"> | null; scale: Kind<"scale"> | null; lot: Kind<"lot"> | null };
const EMPTY: Values = { flow: null, environment: null, scale: null, lot: null };
const format = (v: number, d = 1) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const time = (date: string) => new Date(date).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit" });

function Origin({ source }: { source?: AudienceSource }) {
  return <span className={"aud-src " + (source === "DEVICE" ? "physical" : source === "SIMULATED" ? "simulated" : "pending")}>
    {source === "DEVICE" ? "SENSOR REAL" : source === "SIMULATED" ? "SIMULADO" : "SEM LEITURA"}</span>;
}
function Tile({ title, value, unit, reading, tone, children }: { title: string; value: string; unit: string; reading: AudienceReading | null; tone: string; children?: ReactNode }) {
  return <article className={"aud-tile " + tone}>
    <div className="aud-tile-top"><span>{title}</span><Origin source={reading?.source} /></div>
    <div className="aud-val"><strong>{value}</strong><span>{unit}</span></div>
    <div className="aud-detail">{reading ? reading.deviceCode + " · " + time(reading.at) : "Aguardando leitura do dispositivo"}</div>
    {children}
  </article>;
}
export function PlateiaLive() {
  const [data, setData] = useState<Values>(EMPTY);
  const [connected, setConnected] = useState(false);
  const [seenStatus, setSeenStatus] = useState(false);
  const [clock, setClock] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let source: EventSource | null = null;
    let disposed = false;
    const connect = () => {
      if (disposed || source) return;
      source = new EventSource("/api/plateia/stream");
      source.addEventListener("status", event => {
        try {
          const p = JSON.parse((event as MessageEvent<string>).data) as { serverTime: string; listening: boolean };
          setConnected(p.listening === true);
          setSeenStatus(true);
          const ms = Date.parse(p.serverTime);
          if (Number.isFinite(ms)) setOffset(ms - Date.now());
        } catch { setConnected(false); }
      });
      source.addEventListener("sample", event => {
        try {
          const p = JSON.parse((event as MessageEvent<string>).data) as AudienceReading;
          if (!p || !["flow"].includes(p.kind)) return;
          setData(prev => ({ ...prev, [p.kind]: p }));
        } catch { /* não substituir números por payload inválido */ }
      });
      source.onerror = () => setConnected(false); // o EventSource reconecta com o retry do servidor
    };
    const visibility = () => {
      if (document.hidden) { source?.close(); source = null; setConnected(false); }
      else connect();
    };
    connect();
    const interval = window.setInterval(() => setClock(Date.now()), 2000);
    document.addEventListener("visibilitychange", visibility);
    return () => { disposed = true; source?.close(); window.clearInterval(interval); document.removeEventListener("visibilitychange", visibility); };
  }, []);

  const fresh = (reading: AudienceReading | null) => !!reading && clock !== null &&
    clock + offset - Date.parse(reading.at) >= -5000 && clock + offset - Date.parse(reading.at) <= 35000;
  const flow = fresh(data.flow) ? data.flow : null;
  return <main className="audience">
    <div className="aud-glow" aria-hidden="true" />
    <div className="aud-shell">
      <header className="aud-header">
        <div className="aud-brand"><span>R</span><div><b>RICHARDS</b><small>INTELLIGENCE</small></div></div>
        <small>HACKATHON SENAC 2026</small>
      </header>
      <section className="aud-hero">
        <div className="aud-eyebrow"><i /> EXPERIMENTO CONECTADO</div>
        <h1>O que acontece na bancada, <em>você vê aqui.</em></h1>
        <p>Sensores, dados e decisões em tempo real. Acompanhe o experimento do seu próprio celular enquanto ele acontece.</p>
        <div className={"aud-connection " + (connected ? "online" : "offline")} role="status" aria-live="polite">
          <i /><strong>{connected ? "Conectado ao sinal ao vivo" : seenStatus ? "Reconectando ao servidor" : "Conectando à plataforma"}</strong>
          <span>{connected ? "As leituras são atualizadas automaticamente" : "Leituras antigas não são exibidas como atuais"}</span>
        </div>
      </section>
      <section aria-label="Sensores em tempo real">
        <div className="aud-heading"><h2>Telemetria ao vivo</h2><span>LEITURAS DA BANCADA</span></div>
        <div className="aud-grid">
          <Tile title="Vazão de água" value={flow ? format(flow.flowLpm, 2) : "—"} unit="L/min" reading={flow} tone="water" />

        </div>
      </section>
      <section className="aud-impact">
        <div><small>DO SENSOR À DECISÃO</small><h2>O dado não é o fim. É o começo de uma ação.</h2><p>O RICHARDS acompanha sinais de vazão na instalação. Pessoas verificam o contexto, decidem e registram a ação.</p></div>
        <div className="aud-lot"><small>MAPEAMENTO HIDRÁULICO</small><b>Do ponto ao sinal</b><span>O operador vincula os medidores à planta de casa, comércio ou obra. Pontos sem sensor não recebem valores presumidos.</span></div>
      </section>
      <footer className="aud-footer"><span>RICHARDS INTELLIGENCE · RIBEIRÃO PRETO</span><span>Sensor real e simulação são identificados. Não exibimos economia presumida. Leitura efêmera, sem histórico nesta tela.</span></footer>
    </div>
  </main>;
}
