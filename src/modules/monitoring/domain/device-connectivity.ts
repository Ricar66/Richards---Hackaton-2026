export type DeviceConnectivity = "ONLINE" | "OFFLINE" | "NEVER_SEEN" | "MAINTENANCE";
/** Sem leitura há mais que isso = sem comunicação. 8 intervalos de 15 s: tolera a fila curta do firmware. */
export const OFFLINE_AFTER_SECONDS = 120;
/**
 * Estado calculado na leitura, a partir do último contato. O valor persistido em `Device.state`
 * só vale para MAINTENANCE (decisão humana); "ONLINE" gravado não prova que o sensor ainda fala.
 */
export function deviceConnectivity(persisted: string, lastSeenAt: Date | null, now: Date, offlineAfterSeconds = OFFLINE_AFTER_SECONDS): DeviceConnectivity {
  if (persisted === "MAINTENANCE") return "MAINTENANCE";
  if (!lastSeenAt) return "NEVER_SEEN";
  return now.getTime() - lastSeenAt.getTime() <= offlineAfterSeconds * 1000 ? "ONLINE" : "OFFLINE";
}
