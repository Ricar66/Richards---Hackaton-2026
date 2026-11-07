"use client";
import { useEffect, useRef } from "react";
import { CHANNEL_LABEL, type TripSample, type TripView } from "./stage-logic";

const msText = (n: number, approx = false) => `${approx ? "≈ " : ""}${Math.round(n)} ms`;
/** O que o pacote é. "sensor" sozinho seria lido como "sensor real" no telão. */
const KIND_LABEL: Record<TripSample["kind"], string> = { leitura: "vazão gravada", sensor: "temperatura/peso · fora do histórico" };
const NODE_AT = [0, 25, 50, 75, 100];

/**
 * Viagem do último pacote: dispositivo → ponte/API → regra → banco → tela, só com trechos MEDIDOS.
 * Processamento (recebido → emitido) é do relógio do servidor; entrega usa o ajuste estimado no `hello` ("≈" se > 500 ms);
 * dispositivo → servidor só existe com horário do dispositivo. Trecho não medido nunca entra em soma.
 */
export function PacketTrip({ trip, view, reduced }: { trip: TripSample | null; view: TripView | null; reduced: boolean }) {
  const rider = useRef<HTMLDivElement>(null);
  const lastRun = useRef(0);
  // Só primitivos nas dependências: o tique de 1 s recria `view`, mas o ponto só corre quando chega pacote novo.
  const key = trip ? `${trip.timing.receivedAt}|${trip.timing.emittedAt}|${trip.sequence}` : "";
  const dev = view?.deviceMs ?? null, proc = view?.processingMs ?? null, deliv = view?.deliveryMs ?? null;
  useEffect(() => {
    if (!key || !rider.current || reduced || typeof rider.current.animate !== "function") return;
    const now = performance.now();
    if (now - lastRun.current < 500) return; // no máximo um ponto a cada 500 ms (descarta o visual, não o dado)
    lastRun.current = now;
    const total = (dev ?? 0) + (proc ?? 0) + (deliv ?? 0) || 1;
    // 700 ms de viagem (cada trecho proporcional ao ms medido) + 300 ms sumindo no nó da tela. Só transform e opacity.
    const TRAVEL = 0.7;
    const frames: Keyframe[] = [{ transform: `translateX(${dev !== null ? 0 : 25}%)`, opacity: 1, offset: 0 }];
    let acc = 0;
    if (dev !== null) { acc += dev / total; frames.push({ transform: "translateX(25%)", opacity: 1, offset: acc * TRAVEL }); }
    acc += (proc ?? 0) / total;
    frames.push({ transform: "translateX(75%)", opacity: 1, offset: Math.min(1, acc) * TRAVEL });
    frames.push({ transform: "translateX(100%)", opacity: 1, offset: TRAVEL });
    frames.push({ transform: "translateX(100%)", opacity: 0, offset: 1 });
    const animation = rider.current.animate(frames, { duration: 1000, easing: "linear" });
    return () => animation.cancel();
  }, [key, dev, proc, deliv, reduced]);

  const channel = trip ? CHANNEL_LABEL[trip.channel] ?? trip.channel : "ponte / API";
  const nodes = [trip?.deviceCode ?? "dispositivo", channel, "regra", "banco", "tela"];
  const deviceSeg = !view ? "—" : view.deviceMs !== null ? `${msText(view.deviceMs, true)} (NTP)` : trip?.channel === "mqtt" ? "não medido · MQTT sem horário" : "não medido · sem horário do dispositivo";
  return <section className="inst trip" aria-labelledby="stg-trip-title">
    <header className="inst-head">
      <h2 id="stg-trip-title">Viagem do último pacote</h2>
      {trip && <span className="mono trip-id">{trip.sequence !== null ? `#${trip.sequence}` : "sinal ao vivo"} · {KIND_LABEL[trip.kind]}{trip.source === "SIMULATED" ? " · simulado" : ""}</span>}
      <span className="trip-sum">
        {!view ? "aguardando o primeiro pacote ao vivo"
          : view.totalMs !== null ? <>sensor → tela <b className="num">{msText(view.totalMs, true)}</b></>
          : view.serverToScreenMs !== null ? <>{channel} → tela <b className="num">{msText(view.serverToScreenMs, view.approx)}</b></>
          : "tempo não medido"}
      </span>
    </header>
    <div className="trip-track">
      <div className="trip-rail" aria-hidden="true" />
      {nodes.map((n, i) => <span key={i} className={`trip-node${trip ? " on" : ""}`} style={{ left: `${NODE_AT[i]}%` }}><i /><em>{n}</em></span>)}
      <span className="trip-seg dev" style={{ left: "12.5%" }}>{deviceSeg}</span>
      <span className="trip-seg" style={{ left: "50%" }}>{view?.processingMs != null ? <><b className="num">{msText(view.processingMs)}</b> processamento (regra + banco)</> : view ? "processamento não medido" : "—"}</span>
      <span className="trip-seg" style={{ left: "87.5%" }}>{view?.deliveryMs != null ? <><b className="num">{msText(view.deliveryMs, view.approx)}</b> entrega</> : view ? "entrega não medida" : "—"}</span>
      <div className="trip-rider" ref={rider} aria-hidden="true"><i /></div>
    </div>
  </section>;
}
