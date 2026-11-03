export type DonationState = "PENDING_REVIEW" | "AVAILABLE" | "RESERVED" | "DELIVERED" | "CANCELLED";
/** Violação de regra de negócio: a mensagem é segura para mostrar ao usuário. */
export class DonationRuleError extends Error {}
/** O que a pessoa responsável declara em cada etapa (texto livre, registrado na auditoria). */
export type DonationStepDetails = { verifiedBy?: string; recipientId?: string; receivedBy?: string; reason?: string };
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
    if (next === "AVAILABLE" && !filled(d.verifiedBy, 3)) throw new DonationRuleError("Informe quem fez a verificação humana e sanitária");
    if (next === "RESERVED" && !filled(d.recipientId, 1)) throw new DonationRuleError("Escolha a instituição receptora");
    if (next === "DELIVERED" && !filled(d.receivedBy, 3)) throw new DonationRuleError("Informe quem recebeu o lote na instituição");
    if (next === "CANCELLED" && !filled(d.reason, 5)) throw new DonationRuleError("Descreva o motivo do cancelamento");
  }
}
