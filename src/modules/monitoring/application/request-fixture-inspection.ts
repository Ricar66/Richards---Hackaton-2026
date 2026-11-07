import { getDb } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import { openDeviceOccurrence } from "./open-device-occurrence";
import { getFixtureActivity } from "./get-fixture-activity";

/** Esta é uma inspeção SOLICITADA por pessoa, nunca um diagnóstico ou alerta autônomo. */
export class FixtureInspectionError extends Error {}

export async function requestFixtureInspection(
  deviceId: string,
  declaration: { dedicated: boolean; expectedUse: boolean },
  actor: string,
): Promise<{ id: string; created: boolean }> {
  if (declaration.dedicated !== true || declaration.expectedUse !== true)
    throw new FixtureInspectionError("Confirme que o sensor é dedicado/calibrado e que havia uso esperado");
  const report = await getFixtureActivity({ deviceId });
  const item = report.items[0];
  if (!item) throw new FixtureInspectionError("Dispositivo de vazão não encontrado");
  if (item.state !== "NO_FLOW_OBSERVED")
    throw new FixtureInspectionError("Não há cobertura física suficiente e ausência de fluxo para solicitar esta inspeção");
  const device = await getDb().device.findFirst({
    where: { id: deviceId, organizationId: DEMO_ORG_ID, kind: "FLOW" },
    select: { siteId: true },
  });
  if (!device) throw new FixtureInspectionError("Dispositivo não pertence à organização");
  const opened = await openDeviceOccurrence({
    organizationId: DEMO_ORG_ID, siteId: device.siteId,
    deviceId, deviceCode: item.deviceCode,
    kind: "MANUAL", source: "MANUAL", severity: "MEDIUM",
    title: "Ponto hidráulico sem fluxo observado · solicitar vistoria",
    description: "Nenhum fluxo mensurável nas últimas 72 horas, com cobertura de telemetria suficiente. Operador declarou ponto dedicado/calibrado e uso esperado. Exige vistoria presencial. Não é diagnóstico de entupimento, falta de uso nem falha do equipamento.",
    eventNote: "Inspeção solicitada por operador após análise de telemetria física. Confirmar condições locais.",
    actor,
    evidence: {
      inspectionType: "NO_FLOW_OBSERVED", sourceOfEvidence: "DEVICE",
      windowHours: item.windowHours, checkedAt: item.at,
      coveragePercent: item.coveragePercent, samples: item.samples,
      flowSamples: item.flowSamples, thresholdLpm: item.thresholdLpm,
      dedicatedDeclared: true, expectedUseDeclared: true,
      conclusion: "SUSPECTED_OPERATIONAL_ISSUE_REQUIRES_HUMAN_INSPECTION",
    },
  });
  return { id: opened.occurrenceId, created: opened.created };
}
