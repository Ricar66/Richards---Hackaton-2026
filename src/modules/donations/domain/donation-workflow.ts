export type DonationState = "PENDING_REVIEW" | "AVAILABLE" | "RESERVED" | "DELIVERED" | "CANCELLED";
/** Violação de regra de negócio: a mensagem é segura para mostrar ao usuário. */
export class DonationRuleError extends Error {}
/** O que a pessoa responsável declara em cada etapa (texto livre, registrado na auditoria). */
export const FOOD_ORIGINS = ["WHOLE_PRODUCE", "SEALED_PACKAGED", "UNSERVED_PREPARATION", "BUFFET_EXPOSED", "PLATE_LEFTOVERS", "UNKNOWN"] as const;
export type FoodOrigin = typeof FOOD_ORIGINS[number];
/** Texto da origem como aparece na triagem e no Passaporte do Alimento. */
export const FOOD_ORIGIN_LABEL: Record<FoodOrigin, string> = {
  WHOLE_PRODUCE: "Frutas, verduras ou legumes íntegros",
  SEALED_PACKAGED: "Industrializado lacrado, dentro da validade",
  UNSERVED_PREPARATION: "Preparado na cozinha, ainda não servido",
  BUFFET_EXPOSED: "Buffet ou balcão exposto",
  PLATE_LEFTOVERS: "Restos de prato",
  UNKNOWN: "Origem desconhecida",
};
/** O checklist que a pessoa responsável declara na triagem (o mesmo texto vai para a auditoria e para o passaporte). */
export const SANITARY_CHECKS = [
  { key: "inspectionOk", label: "Inspeção visual sem sinais de deterioração" },
  { key: "conservationOk", label: "Tempo e temperatura de conservação compatíveis com o alimento" },
  { key: "validityOk", label: "Validade, integridade e embalagem conferidas (quando aplicável)" },
  { key: "transportOk", label: "Transporte e entrega terão acondicionamento sanitário adequado" },
] as const;
export type DonationStepDetails = {
  verifiedBy?: string; recipientId?: string; receivedBy?: string; reason?: string;
  foodOrigin?: FoodOrigin; reviewerQualification?: string;
  inspectionOk?: boolean; conservationOk?: boolean; validityOk?: boolean; transportOk?: boolean;
  /** Equipamento de onde o alimento saiu; null = declarado que não estava em equipamento monitorado. */
  originEquipmentId?: string | null;
};
const filled = (s: string | undefined, min: number) => (s?.trim().length ?? 0) >= min;

export class DonationWorkflow {
  static assertTransition(current: DonationState, next: DonationState, verified: boolean, hasRecipient: boolean) {
    const options: Record<DonationState, DonationState[]> = {
      PENDING_REVIEW: ["AVAILABLE", "CANCELLED"], AVAILABLE: ["RESERVED", "CANCELLED"],
      RESERVED: ["DELIVERED", "CANCELLED"], DELIVERED: [], CANCELLED: [],
    };
    if (!options[current].includes(next)) throw new DonationRuleError(`Transição inválida: ${current} → ${next}`);
    if ((next === "AVAILABLE" || next === "RESERVED" || next === "DELIVERED") && !verified)
      throw new DonationRuleError("Exige verificação humana e sanitária documentada");
    if ((next === "RESERVED" || next === "DELIVERED") && !hasRecipient)
      throw new DonationRuleError("Exige instituição receptora vinculada");
  }
  /** Cada etapa exige a declaração humana correspondente; o software não certifica segurança alimentar. */
  static assertDetails(next: DonationState, d: DonationStepDetails) {
    if (next === "AVAILABLE") {
      if (!filled(d.verifiedBy, 3)) throw new DonationRuleError("Informe quem fez a verificação humana e sanitária");
      if (!d.foodOrigin || d.foodOrigin === "UNKNOWN") throw new DonationRuleError("Informe a origem e a exposição do alimento");
      if (d.foodOrigin === "PLATE_LEFTOVERS") throw new DonationRuleError("Restos de prato/consumidor não são aceitos como doação");
      if (d.foodOrigin === "BUFFET_EXPOSED") throw new DonationRuleError("Alimento de buffet exposto exige avaliação sanitária específica; este MVP mantém o lote em revisão");
      if (!filled(d.reviewerQualification, 3)) throw new DonationRuleError("Informe cargo/habilitação do responsável pela triagem sanitária");
      if (![d.inspectionOk, d.conservationOk, d.validityOk, d.transportOk].every(v => v === true))
        throw new DonationRuleError("Conclua todas as verificações sanitárias e de transporte");
    }
    if (next === "RESERVED" && !filled(d.recipientId, 1)) throw new DonationRuleError("Escolha a instituição receptora");
    if (next === "DELIVERED" && !filled(d.receivedBy, 3)) throw new DonationRuleError("Informe quem recebeu o lote na instituição");
    if (next === "CANCELLED" && !filled(d.reason, 5)) throw new DonationRuleError("Descreva o motivo do cancelamento");
  }
}
