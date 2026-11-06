import type { DonationStatus, OccurrenceStatus, Provenance, Severity, SourceKey } from "@/modules/analytics/domain/dashboard";
import type { DeviceConnectivity } from "@/modules/monitoring/domain/device-connectivity";

/**
 * Cores de estado do tema escuro, validadas sobre o painel #0d1c23 (dataviz validate_palette, modo dark: L 0,48–0,67,
 * croma ≥ 0,10, contraste ≥ 3:1, ΔE normal ≥ 20 e protan/deutan ≥ 9 entre Aberta, Em análise e Resolvida).
 * Reservadas para estado; nunca usadas como "série 2". Sempre acompanham texto/ícone.
 */
export const STATUS_COLOR: Record<OccurrenceStatus, string> = { OPEN: "#c8761f", ACKNOWLEDGED: "#5b8def", RESOLVED: "#1d9d70", DISMISSED: "#7a8a90" };
export const STATUS_LABEL: Record<OccurrenceStatus, string> = { OPEN: "Aberta", ACKNOWLEDGED: "Em análise", RESOLVED: "Resolvida", DISMISSED: "Descartada" };
export const STATUS_TONE: Record<OccurrenceStatus, "warn" | "info" | "ok" | "neutral"> = { OPEN: "warn", ACKNOWLEDGED: "info", RESOLVED: "ok", DISMISSED: "neutral" };

export const SEVERITY_LABEL: Record<Severity, string> = { CRITICAL: "Crítica", HIGH: "Alta", MEDIUM: "Média", LOW: "Baixa" };
/** Ordinal (sempre com o rótulo ao lado): vermelho e laranja se confundem em deuteranopia, por isso nunca vêm sozinhos. */
export const SEVERITY_COLOR: Record<Severity, string> = { CRITICAL: "#e84f86", HIGH: "#d94a3d", MEDIUM: "#c8761f", LOW: "#7a8a90" };

export const SOURCE_LABEL: Record<SourceKey, string> = { DEVICE: "Sensor", SIMULATED: "Simulado", MANUAL: "Manual" };
export const PROVENANCE_LABEL: Record<Provenance, string> = { DEVICE: "Telemetria real", SIMULATED: "Dados simulados", MANUAL: "Registro manual", MIXED: "Dados mistos", NONE: "Sem leituras" };

export const CONNECTIVITY_LABEL: Record<DeviceConnectivity, string> = { ONLINE: "Comunicando", OFFLINE: "Sem comunicação", NEVER_SEEN: "Nunca comunicou", MAINTENANCE: "Em manutenção" };
export const CONNECTIVITY_TONE: Record<DeviceConnectivity, "ok" | "warn" | "neutral" | "info"> = { ONLINE: "ok", OFFLINE: "warn", NEVER_SEEN: "neutral", MAINTENANCE: "info" };

export const DONATION_LABEL: Record<DonationStatus, string> = { PENDING_REVIEW: "Verificação pendente", AVAILABLE: "Disponível", RESERVED: "Reservado", DELIVERED: "Entregue", CANCELLED: "Cancelado" };
export const DONATION_TONE: Record<DonationStatus, "warn" | "info" | "ok" | "neutral"> = { PENDING_REVIEW: "warn", AVAILABLE: "info", RESERVED: "info", DELIVERED: "ok", CANCELLED: "neutral" };

export const KIND_LABEL: Record<string, string> = { UNUSUAL_FLOW: "Fluxo contínuo", DEVICE_OFFLINE: "Sem comunicação", TEMPERATURE_EXCURSION: "Temperatura", MANUAL: "Registro manual" };

/** Série principal (volume de água): menta da marca. Vazão: ciano, em gráfico separado (grandezas diferentes nunca dividem eixo). */
export const WATER = "#5fe3bb";
export const FLOW = "#6cc9e6";
/** Vazão média e trecho "depois da abertura": cinza-azulado, secundário. */
export const FLOW_AVG = "#7c97a3";

/** Peças dos gráficos sobre o painel escuro (eixos legíveis no projetor: rótulo ≥ 12 px, contraste 7:1). */
export const CHART = {
  grid: "#1b3239", axis: "#2a454c", tick: "#94aab0", surface: "#0d1c23",
  threshold: "#ffb978", thresholdText: "#ffcf9e", brushStroke: "#3d6f69", brushFill: "#0a171d",
} as const;
export const AXIS_TICK = { fontSize: 12, fill: CHART.tick };
export const TIP_STYLE = { borderRadius: 10, border: "1px solid #2a4750", background: "#0f2229", color: "#e9f5f1", fontSize: 12.5 } as const;
