import { z } from "zod";
export const ORIGINS = ["PREPARATION", "KITCHEN_UNSERVED", "BUFFET", "PLATE", "UNKNOWN"] as const;
export const MATERIALS = ["PLANT_ONLY", "MIXED_FOOD", "ANIMAL_FATS", "UNKNOWN"] as const;
export const METHODS = ["COMPOSTING", "BIODIGESTION", "DISPOSAL"] as const;
export const SOURCES = ["MANUAL", "SIMULATED"] as const;
export const STATUSES = ["REGISTERED", "RESIDUE", "DONATION_REFERRED", "SCHEDULED", "COLLECTED", "RECEIVED", "EVIDENCED", "CANCELLED"] as const;
export const kg = z.number().finite().positive().max(100000).refine(n => Math.abs(n * 1000 - Math.round(n * 1000)) < 0.000001, "Use até três casas decimais");
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const id = text(1, 100).regex(/^[A-Za-z0-9_-]+$/);
const requestKey = text(16, 80).regex(/^[A-Za-z0-9_-]+$/);
const date = z.iso.datetime({ offset: true });
const version = z.number().int().nonnegative();
const attested = z.literal(true);
export const batchInput = z.object({ requestKey, siteId: id, description: text(4, 180), weightKg: kg, origin: z.enum(ORIGINS), material: z.enum(MATERIALS), reason: text(5, 500), source: z.enum(SOURCES), occurredAt: date }).strict();
export const partnerInput = z.object({ name: text(3, 150), city: text(2, 100), source: z.enum(SOURCES), methods: z.array(z.enum(METHODS)).min(1).max(3), materials: z.array(z.enum(MATERIALS).exclude(["UNKNOWN"])).min(1).max(3), authorizationReference: text(5, 300), reviewedBy: text(3, 120), reviewExpiresAt: date, attested }).strict();
export const actionInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("TRIAGE"), version, decision: z.enum(["RESIDUE", "DONATION"]), origin: z.enum(ORIGINS), material: z.enum(MATERIALS), reviewedBy: text(3, 120), note: text(10, 500), attested }).strict(),
  z.object({ action: z.literal("SCHEDULE"), version, partnerId: id, method: z.enum(METHODS), scheduledAt: date, reason: text(10, 500), attested }).strict(),
  z.object({ action: z.literal("COLLECT"), requestKey, version, weightKg: kg, eventAt: date, receivedBy: text(3, 120), attested }).strict(),
  z.object({ action: z.literal("CANCEL"), version, reason: text(10, 500) }).strict(),
]);
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const evidenceInput = z.object({ requestKey, version, kind: z.enum(["RECEIPT", "TREATMENT", "DISPOSAL"]), weightKg: kg, eventAt: date, documentReference: text(3, 180), reviewedBy: text(3, 120), attested,
  file: z.object({ mime: z.enum(["application/pdf", "image/png", "image/jpeg"]), base64: z.string().min(4).max(Math.ceil(MAX_FILE_BYTES / 3) * 4) }).strict(),
}).strict();
export type BatchInput = z.infer<typeof batchInput>;
export type PartnerInput = z.infer<typeof partnerInput>;
export type ActionInput = z.infer<typeof actionInput>;
export type EvidenceInput = z.infer<typeof evidenceInput>;
export class CircularError extends Error { constructor(message: string, public status = 409) { super(message); } }
export const grams = (n: number | string | { toString(): string }) => Math.round(Number(n.toString()) * 1000);
export function requireMass(available: number, addition: number) {
  if (!Number.isSafeInteger(addition) || addition <= 0 || addition > available) throw new CircularError("A quantidade excede o saldo desta etapa");
}
export function pastDate(value: string, now: Date, minimum?: Date | null) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date > now || (minimum && date < minimum)) throw new CircularError("Data incompatível com a sequência dos fatos");
  return date;
}
