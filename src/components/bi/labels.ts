import type { DonationStatus, OccurrenceStatus, Provenance, Severity, SourceKey } from "@/modules/analytics/domain/dashboard";
import type { DeviceConnectivity } from "@/modules/monitoring/domain/device-connectivity";

/**
 * Cores de estado validadas para daltonismo (dataviz validate_palette: ΔE ≥ 21 entre vizinhas, contraste ≥ 3:1).
 * Reservadas para estado; nunca usadas como "série 2". Sempre acompanham texto/ícone.
 */
export const STATUS_COLOR: Record<OccurrenceStatus, string> = { OPEN: "#cf7a12", ACKNOWLEDGED: "#4466d6", RESOLVED: "#0e9a73", DISMISSED: "#8b989d" };
export const STATUS_LABEL: Record<OccurrenceStatus, string> = { OPEN: "Aberta", ACKNOWLEDGED: "Em análise", RESOLVED: "Resolvida", DISMISSED: "Descartada" };
export const STATUS_TONE: Record<OccurrenceStatus, "warn" | "info" | "ok" | "neutral"> = { OPEN: "warn", ACKNOWLEDGED: "info", RESOLVED: "ok", DISMISSED: "neutral" };

export const SEVERITY_LABEL: Record<Severity, string> = { CRITICAL: "Crítica", HIGH: "Alta", MEDIUM: "Média", LOW: "Baixa" };
export const SEVERITY_COLOR: Record<Severity, string> = { CRITICAL: "#b3261e", HIGH: "#c74944", MEDIUM: "#cf7a12", LOW: "#6f8389" };

export const SOURCE_LABEL: Record<SourceKey, string> = { DEVICE: "Sensor", SIMULATED: "Simulado", MANUAL: "Manual" };
export const PROVENANCE_LABEL: Record<Provenance, string> = { DEVICE: "Telemetria real", SIMULATED: "Dados simulados", MANUAL: "Registro manual", MIXED: "Dados mistos", NONE: "Sem leituras" };

export const CONNECTIVITY_LABEL: Record<DeviceConnectivity, string> = { ONLINE: "Comunicando", OFFLINE: "Sem comunicação", NEVER_SEEN: "Nunca comunicou", MAINTENANCE: "Em manutenção" };
export const CONNECTIVITY_TONE: Record<DeviceConnectivity, "ok" | "warn" | "neutral" | "info"> = { ONLINE: "ok", OFFLINE: "warn", NEVER_SEEN: "neutral", MAINTENANCE: "info" };

export const DONATION_LABEL: Record<DonationStatus, string> = { PENDING_REVIEW: "Verificação pendente", AVAILABLE: "Disponível", RESERVED: "Reservado", DELIVERED: "Entregue", CANCELLED: "Cancelado" };
export const DONATION_TONE: Record<DonationStatus, "warn" | "info" | "ok" | "neutral"> = { PENDING_REVIEW: "warn", AVAILABLE: "info", RESERVED: "info", DELIVERED: "ok", CANCELLED: "neutral" };

export const KIND_LABEL: Record<string, string> = { UNUSUAL_FLOW: "Fluxo contínuo", DEVICE_OFFLINE: "Sem comunicação", TEMPERATURE_EXCURSION: "Temperatura", MANUAL: "Registro manual" };

/** Série principal (volume de água): uma cor só, a da marca. */
export const WATER = "#137e77";
export const FLOW = "#2b5f8a";
