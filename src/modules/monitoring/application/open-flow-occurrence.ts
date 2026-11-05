import { openDeviceOccurrence, type OpenDeviceOccurrenceInput, type OpenDeviceOccurrenceResult } from "./open-device-occurrence";
export type OpenFlowOccurrenceInput = Omit<OpenDeviceOccurrenceInput, "kind" | "severity" | "suspectedLiters"> & { suspectedLiters: number };
export type OpenFlowOccurrenceResult = OpenDeviceOccurrenceResult;
/** Fluxo contínuo suspeito (UNUSUAL_FLOW, severidade HIGH). Regra 5 e transação: ver `openDeviceOccurrence`. */
export function openFlowOccurrence(input: OpenFlowOccurrenceInput): Promise<OpenFlowOccurrenceResult> {
  return openDeviceOccurrence({ ...input, kind: "UNUSUAL_FLOW", severity: "HIGH" });
}
