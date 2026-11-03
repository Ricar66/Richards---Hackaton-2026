import { getDb } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
export class OccurrenceService {
  async transition(id: string, next: "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED", note: string) {
    const db = getDb();
    const occurrence = await db.occurrence.findFirst({ where: { id, organizationId: DEMO_ORG_ID } });
    if (!occurrence) throw new Error("NOT_FOUND");
    const allowed: Record<string, string[]> = { OPEN: ["ACKNOWLEDGED", "RESOLVED", "DISMISSED"], ACKNOWLEDGED: ["RESOLVED", "DISMISSED"], RESOLVED: [], DISMISSED: [] };
    if (!allowed[occurrence.status].includes(next)) throw new Error("INVALID_TRANSITION");
    if ((next === "RESOLVED" || next === "DISMISSED") && note.trim().length < 5) throw new Error("RESOLUTION_NOTE_REQUIRED");
    return db.occurrence.update({ where: { id }, data: {
      status: next, acknowledgedAt: next === "ACKNOWLEDGED" ? new Date() : occurrence.acknowledgedAt,
      resolvedAt: next === "RESOLVED" || next === "DISMISSED" ? new Date() : null,
      verificationNote: note,
      events: { create: { action: next, note } },
    } });
  }
}
