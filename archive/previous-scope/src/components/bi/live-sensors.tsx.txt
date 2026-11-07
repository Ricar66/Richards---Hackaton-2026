"use client";
import { useState } from "react";
import Link from "next/link";
import type { LiveSource } from "@/modules/realtime/domain/live-event";
import { useLiveEvent, useLiveState } from "./live-stream";
import { useNow } from "./hooks";

/** Reutiliza o EventSource já aberto pelo shell do BI. Peso e ambiente são EFÊMEROS. */
type Env = { c: number; humidity: number | null; source: LiveSource; code: string; at: string };
type Weight = { kg: number; min: number; seconds: number; phase: string; source: LiveSource; code: string; at: string };
const num = (v: number, d = 1) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const origin = (s: LiveSource) => s === "DEVICE" ? "SENSOR REAL" : s === "SIMULATED" ? "SIMULADO" : "MANUAL";
const fresh = (at: string, now: number | null) => now !== null && now - Date.parse(at) <= 35000 && now - Date.parse(at) >= -5000;

export function LiveSensorTiles() {
  const [temperature, setTemperature] = useState<Env | null>(null);
  const [weight, setWeight] = useState<Weight | null>(null);
  const now = useNow();
  const connection = useLiveState();
  useLiveEvent("sensor.live", e => {
    if (e.temperature) setTemperature({ c: e.temperature.c, humidity: e.temperature.humidityPct ?? null, source: e.temperature.source, code: e.deviceCode, at: e.at });
    if (e.scale) setWeight({ kg: e.scale.kg, min: e.scale.progress.minKg, seconds: e.scale.progress.requiredSeconds, phase: e.scale.progress.phase, source: e.scale.source, code: e.deviceCode, at: e.at });
  });
  const t = temperature && fresh(temperature.at, now) ? temperature : null;
  const w = weight && fresh(weight.at, now) ? weight : null;
  return <section className="bi-sensor-live" aria-label="Leituras da temperatura, umidade e balança">
    <div className="bi-sensor-head">
      <div><span>INTEGRAÇÃO MQTT · DHT11 E HX711</span><h2>Sensores em tempo real</h2><p>Leituras efêmeras: ao recarregar, aguardam o próximo pacote do ESP32.</p></div>
      <Link href="/convite">Exibir QR para a plateia</Link>
    </div>
    <div className="bi-sensor-cards">
      <article><span>Temperatura</span><strong>{t ? num(t.c) : "—"}<small> °C</small></strong><div>{t ? origin(t.source) + " · " + t.code : "Aguardando leitura"}</div></article>
      <article><span>Umidade relativa</span><strong>{t?.humidity != null ? num(t.humidity, 0) : "—"}<small> %</small></strong><div>{t ? origin(t.source) + " · " + t.code : "Aguardando leitura"}</div></article>
      <article><span>Peso da balança</span><strong>{w ? num(w.kg, 2) : "—"}<small> kg</small></strong><div>{w ? origin(w.source) + " · " + w.code : "Aguardando leitura"}</div>{w && <p>Gatilho {num(w.min)} kg / {num(w.seconds, 0)} s · {w.phase === "stabilizing" ? "estabilizando" : w.phase === "triggered" ? "lote criado" : w.phase === "blocked" ? "lote pendente" : w.phase === "disarmed" ? "retirar carga" : "em espera"}</p>}</article>
    </div>
    <p className="bi-sensor-note">{connection === "live" ? "Stream do servidor conectado." : "Reconectando ao servidor."} Sem leitura nova, o valor deixa de ser apresentado como atual. A criação do lote não aprova doação.</p>
  </section>;
}
