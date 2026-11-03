import { getDb } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import { auditRecord } from "@/modules/audit/infrastructure/audit-record";
export type OccurrenceTransition = "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";
export class OccurrenceService {
  async transition(id: string, next: OccurrenceTransition, note: string, actor: string) {
    const db = getDb();
    const occurrence = await db.occurrence.findFirst({ where: { id, organizationId: DEMO_ORG_ID } });
    if (!occurrence) throw new Error("NOT_FOUND");
    const allowed: Record<string, string[]> = { OPEN: ["ACKNOWLEDGED", "RESOLVED", "DISMISSED"], ACKNOWLEDGED: ["RESOLVED", "DISMISSED"], RESOLVED: [], DISMISSED: [] };
    if (!allowed[occurrence.status].includes(next)) throw new Error("INVALID_TRANSITION");
    const text = note.trim();
    if ((next === "RESOLVED" || next === "DISMISSED") && text.length < 5) throw new Error("RESOLUTION_NOTE_REQUIRED");
    return db.$transaction(async tx => {
      const now = new Date();
      // Guarda otimista: só muda se o status ainda é o que foi lido; ações simultâneas não se sobrescrevem.
      const { count } = await tx.occurrence.updateMany({ where: { id, organizationId: DEMO_ORG_ID, status: occurrence.status }, data: {
        status: next,
        acknowledgedAt: next === "ACKNOWLEDGED" ? now : undefined,
        resolvedAt: next === "RESOLVED" || next === "DISMISSED" ? now : undefined,
        verificationNote: next === "ACKNOWLEDGED" ? undefined : text,
      } });
      if (count === 0) throw new Error("CONFLICT");
      await tx.occurrenceEvent.create({ data: { occurrenceId: id, action: next, note: text || null, actor } });
      await tx.auditEvent.create({ data: auditRecord({ organizationId: occurrence.organizationId, entity: "Occurrence", entityId: id, action: next, actor, metadata: { from: occurrence.status, note: text || null } }) });
      return { id, status: next };
    });
  }
}
