export type TrendPoint = { label: string; water: number; reference: number };
export type StatusSlice = { name: string; value: number; color: string };
export type OccurrenceDTO = { id: string; title: string; description: string; severity: "LOW"|"MEDIUM"|"HIGH"|"CRITICAL"; status: "OPEN"|"ACKNOWLEDGED"|"RESOLVED"|"DISMISSED"; source: "DEVICE"|"SIMULATED"|"MANUAL"; time: string; liters: number | null };
export type DonationDTO = { id: string; description: string; kg: number; status: "PENDING_REVIEW"|"AVAILABLE"|"RESERVED"|"DELIVERED"|"CANCELLED"; source: "DEVICE"|"SIMULATED"|"MANUAL"; recipient: string; createdAt: string };
export type DeviceDTO = { id: string; code: string; label: string; state: "ONLINE"|"OFFLINE"|"MAINTENANCE"; kind: string; lastSeen: string | null };
export type OverviewDTO = {
  dataset: "SIMULATED"|"MIXED"|"DEVICE"; updatedAt: string; business: string;
  metrics: { observedLiters: number; openAlerts: number; deliveredKg: number; resolved: number; averageResponseMin: number|null; devices: number };
  trend: TrendPoint[]; distribution: StatusSlice[]; occurrences: OccurrenceDTO[]; donations: DonationDTO[]; devices: DeviceDTO[];
};
