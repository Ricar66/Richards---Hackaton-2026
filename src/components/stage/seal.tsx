import type { LiveSource } from "@/modules/realtime/domain/live-event";
import { SEAL_LABEL, SOURCE_BADGE, type OriginBadge, type Seal as SealKind } from "./stage-logic";

/** Carimbo de origem (linguagem do `.stamp` do BI): a origem nunca depende só da cor, sempre está escrita. */
export function Seal({ label, simulated, small }: { label: string; simulated: boolean; small?: boolean }) {
  return <span className={`seal ${simulated ? "sim" : "real"}${small ? " small" : ""}`}>{label}</span>;
}

/** Selo com tom próprio (real, simulado ou neutro): origem de uma ocorrência ou de um registro. */
export function BadgeSeal({ badge, small }: { badge: OriginBadge; small?: boolean }) {
  return <span className={`seal ${badge.tone}${small ? " small" : ""}`}>{badge.label}</span>;
}
/** Origem de um registro (SENSOR, SIMULADO, MANUAL), como no feed. */
export function SourceSeal({ source }: { source: LiveSource }) {
  const badge = SOURCE_BADGE[source];
  return badge ? <BadgeSeal badge={badge} small /> : null;
}

const TONE: Record<SealKind, string> = { DEVICE: "real", SIMULATED: "sim", MIXED: "mixed", NONE: "none" };
/** Selo global do cabeçalho, pela origem dos últimos pacotes. */
export function GlobalSeal({ seal }: { seal: SealKind }) {
  return <span className={`seal seal-stamp ${TONE[seal]}`} title="Origem dos pacotes do último minuto">{SEAL_LABEL[seal]}</span>;
}

const COUNTER: Record<string, string> = { DEVICE: "SENSOR", SIMULATED: "SIMULADO", MANUAL: "MANUAL", MIXED: "MISTO" };
/** Origem de um contador do snapshot (NONE = sem registro, sem selo). */
export function CounterSeal({ provenance }: { provenance: string }) {
  const label = COUNTER[provenance];
  return label ? <span className={`seal small ${provenance === "SIMULATED" || provenance === "MIXED" ? "sim" : provenance === "DEVICE" ? "real" : "neutral"}`}>{label}</span> : null;
}
