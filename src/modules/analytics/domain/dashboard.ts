import type { Bucket, RangeKey, SourceFilter } from "./analytics-filter";
import type { DeviceConnectivity } from "@/modules/monitoring/domain/device-connectivity";

export type SourceKey = "DEVICE" | "SIMULATED" | "MANUAL";
/** Origem das leituras do recorte. NONE = nenhuma leitura no período (a UI diz "sem dados", não mostra zero). */
export type Provenance = SourceKey | "MIXED" | "NONE";
export type OccurrenceStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type DonationStatus = "PENDING_REVIEW" | "AVAILABLE" | "RESERVED" | "DELIVERED" | "CANCELLED";

/** Um intervalo do gráfico. `liters` null = nenhuma leitura no intervalo (lacuna), diferente de 0 L medido. */
export type SeriesPoint = {
  t: number; end: number;
  liters: number | null; avgFlowLpm: number | null; maxFlowLpm: number | null;
  samples: number;
  /** Intervalo ainda em andamento (contém "agora"): o total vai crescer. */
  partial: boolean;
  occurrences: number;
};

export type OccurrenceMarker = {
  id: string; title: string; severity: Severity; status: OccurrenceStatus; source: SourceKey; openedAt: string;
  /** Janela que a regra avaliou (auditoria do CREATED). null quando a ocorrência não veio da regra. */
  windowStart: string | null; windowEnd: string | null;
};

export type DashboardOccurrence = {
  id: string; title: string; description: string; kind: string; severity: Severity; status: OccurrenceStatus; source: SourceKey;
  deviceId: string | null; deviceCode: string | null; siteName: string;
  openedAt: string; acknowledgedAt: string | null; resolvedAt: string | null;
  suspectedLiters: number | null;
  /** Minutos entre abertura e encerramento; null enquanto ativa. */
  resolutionMin: number | null;
};

export type DashboardDonation = {
  id: string; description: string; kg: number; status: DonationStatus; source: SourceKey;
  recipientId: string | null; recipient: string | null;
  createdAt: string; verifiedBy: string | null; verifiedAt: string | null; receivedAt: string | null; receivedBy: string | null;
};

export type DashboardDevice = {
  id: string; code: string; label: string; kind: string; siteId: string; siteName: string;
  connectivity: DeviceConnectivity; lastSeen: string | null;
  /** Leituras e litros do dispositivo dentro do filtro atual. */
  samples: number; liters: number | null;
  minFlowLpm: number; continuousSeconds: number; pulsesPerLiter: number;
};

export type HeatCell = { dow: number; hour: number; liters: number; days: number };

export type DashboardDTO = {
  generatedAt: string;
  organization: { name: string; city: string; sector: string };
  filter: { range: RangeKey | "custom"; from: string; to: string; bucket: Bucket; bucketSeconds: number; siteId: string | null; deviceId: string | null; source: SourceFilter; query: string };
  options: { sites: { id: string; name: string }[]; devices: { id: string; code: string; label: string; siteId: string }[] };
  provenance: { label: Provenance; sources: { source: SourceKey; samples: number }[]; samples: number; firstReading: string | null; lastReading: string | null };
  kpis: {
    observedLiters: number | null; previousLiters: number | null;
    /** Leituras do período anterior: comparação só vale com cobertura parecida (a UI não mostra variação sobre base rala). */
    previousSamples: number;
    peakFlowLpm: number | null; nightLiters: number | null;
    activeOccurrences: number; openOccurrences: number; acknowledgedOccurrences: number;
    openedInPeriod: number; resolvedInPeriod: number; dismissedInPeriod: number;
    avgResolutionMin: number | null; avgAckMin: number | null;
    deliveredKg: number; deliveredCount: number; availableKg: number; pendingReview: number;
    devices: number; devicesOnline: number;
  };
  series: SeriesPoint[];
  /** Regra de fluxo contínuo do(s) sensor(es) do recorte; null se os sensores têm regras diferentes. */
  threshold: { minFlowLpm: number; continuousSeconds: number } | null;
  markers: OccurrenceMarker[];
  heatmap: HeatCell[];
  statusBreakdown: { status: OccurrenceStatus; count: number }[];
  severityBreakdown: { severity: Severity; count: number }[];
  occurrences: DashboardOccurrence[];
  donations: { items: DashboardDonation[]; pipeline: { status: DonationStatus; count: number; kg: number }[] };
  devices: DashboardDevice[];
};

export type LiveDTO = {
  generatedAt: string;
  lastReading: { at: string; flowLpm: number; deltaLiters: number; source: SourceKey; deviceCode: string } | null;
  recent: { t: number; flowLpm: number }[];
  active: { id: string; title: string; severity: Severity; status: OccurrenceStatus; source: SourceKey; openedAt: string }[];
  activeCount: number;
};

export type IntervalDTO = {
  from: string; to: string;
  readings: { at: string; deviceCode: string; flowLpm: number; deltaLiters: number; source: SourceKey; sequence: number }[];
  truncated: boolean;
  totals: { samples: number; liters: number; maxFlowLpm: number | null };
  occurrences: { id: string; title: string; severity: Severity; status: OccurrenceStatus; source: SourceKey; openedAt: string; relation: "OPENED_IN_INTERVAL" | "EVIDENCE_OVERLAPS" }[];
};
