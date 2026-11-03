export type DonationState = "PENDING_REVIEW" | "AVAILABLE" | "RESERVED" | "DELIVERED" | "CANCELLED";
/** Violação de regra de negócio: a mensagem é segura para mostrar ao usuário. */
export class DonationRuleError extends Error {}
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
}
