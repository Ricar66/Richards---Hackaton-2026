import { waterDashboard } from "@/modules/analytics/domain/water-projection";
import { getDashboard } from "@/modules/analytics/application/get-dashboard";
import { parseAnalyticsFilter } from "@/modules/analytics/domain/analytics-filter";
import { getOccurrenceDetail } from "@/modules/monitoring/application/get-occurrence-detail";
import { getDb } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import { PRODUCT_KNOWLEDGE } from "../domain/knowledge";
import { toolArguments, type ToolName } from "../domain/contracts";
export async function executeAssistantTool(name: string, raw: unknown): Promise<{ data: unknown; source: { label: string; href: string } }> {
  if (!Object.hasOwn(toolArguments, name)) throw new Error("UNKNOWN_TOOL");
  const key = name as ToolName;
  const p = toolArguments[key].safeParse(raw);
  if (!p.success) throw new Error("INVALID_TOOL_ARGUMENTS");
  if (key === "product_help") {
    const { topic } = toolArguments.product_help.parse(raw);
    return { data: { topic, content: PRODUCT_KNOWLEDGE[topic] }, source: { label: `Guia RICHARDS · ${topic}`, href: "/assistente" } };
  }
  if (key === "operation_summary") {
    const { range, source } = toolArguments.operation_summary.parse(raw);
    const d = await getDashboard(parseAnalyticsFilter(new URLSearchParams({ range, source })));
    // Whitelist: não enviar recebedor, verificador, notas, e-mail ou tokens para o modelo.
    return { data: { generatedAt: d.generatedAt, period: d.filter, provenance: d.provenance, kpis: waterDashboard(d).kpis, devices: d.devices.map(x => ({ code: x.code, kind: x.kind, lastSeen: x.lastSeen, connectivity: x.connectivity, samples: x.samples, liters: x.liters, minFlowLpm: x.minFlowLpm, continuousSeconds: x.continuousSeconds })) }, source: { label: `BI · ${range} · ${source}`, href: `/?range=${range}&source=${source}` } };
  }
  if (key === "active_occurrences") {
    const rows = await getDb().occurrence.findMany({ where: { organizationId: DEMO_ORG_ID, kind: {not:"TEMPERATURE_EXCURSION"}, status: { in: ["OPEN", "ACKNOWLEDGED"] } }, orderBy: { openedAt: "desc" }, take: 30, select: { id: true, title: true, kind: true, severity: true, status: true, source: true, openedAt: true, device: { select: { code: true } } } });
    return { data: { generatedAt: new Date().toISOString(), limit: 30, occurrences: rows }, source: { label: "Ocorrências ativas · até 30", href: "/ocorrencias" } };
  }
  const { id } = toolArguments.occurrence_evidence.parse(raw);
  const d = await getOccurrenceDetail(id); // Serviço já restringe a organização do workspace.
  return { data: { id: d.id, kind: d.kind, status: d.status, source: d.source, severity: d.severity, openedAt: d.openedAt, device: d.device && { code: d.device.code, connectivity: d.device.connectivity, lastSeen: d.device.lastSeen }, evidenceNote: d.evidenceNote, evidence: d.evidence && { windowStart: d.evidence.windowStart, windowEnd: d.evidence.windowEnd, rule: d.evidence.rule, totals: d.evidence.totals, readings: d.evidence.readings.slice(-20) }, timeline: d.timeline.map(x => ({ action: x.action, at: x.at })) }, source: { label: `Evidência · ${id}`, href: `/ocorrencias?oc=${encodeURIComponent(id)}` } };
}
