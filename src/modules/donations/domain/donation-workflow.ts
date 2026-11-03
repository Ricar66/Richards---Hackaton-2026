export type DonationState = "PENDING_REVIEW" | "AVAILABLE" | "RESERVED" | "DELIVERED" | "CANCELLED";
export class DonationWorkflow {
  static assertTransition(current: DonationState, next: DonationState, verified: boolean, hasRecipient: boolean) {
    const options: Record<DonationState, DonationState[]> = {
      PENDING_REVIEW: ["AVAILABLE", "CANCELLED"], AVAILABLE: ["RESERVED", "CANCELLED"],
      RESERVED: ["DELIVERED", "CANCELLED"], DELIVERED: [], CANCELLED: [],
    };
    if (!options[current].includes(next)) throw new Error(`Transição inválida: ${current} → ${next}`);
    if ((next === "AVAILABLE" || next === "RESERVED" || next === "DELIVERED") && !verified)
      throw new Error("Exige verificação humana e sanitária documentada");
    if ((next === "RESERVED" || next === "DELIVERED") && !hasRecipient)
      throw new Error("Exige instituição receptora vinculada");
  }
}
