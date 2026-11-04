export const alertService = {
  // 1. Registra alerta de Vazamento de Água ou Temperatura Crítica + Missão de Inspeção
  processOccurrenceAlert: async (
    tx: any,
    organizationId: string,
    siteId: string,
    deviceId: string,
    kind: "UNUSUAL_FLOW" | "TEMPERATURE_EXCURSION",
    severity: "MEDIUM" | "HIGH" | "CRITICAL",
    title: string,
    description: string,
    suspectedLiters?: number,
  ) => {
    // Evita criar alertas repetidos se já houver um OPEN do mesmo tipo
    const existing = await tx.occurrence.findFirst({
      where: {
        organizationId,
        deviceId,
        kind,
        status: "OPEN",
      },
    });

    if (existing) {
      return existing;
    }

    const occurrence = await tx.occurrence.create({
      data: {
        organizationId,
        siteId,
        deviceId,
        kind,
        severity,
        status: "OPEN",
        source: "DEVICE",
        title,
        description,
        suspectedLiters: suspectedLiters ?? null,
      },
    });

    await tx.mission.create({
      data: {
        organizationId,
        occurrenceId: occurrence.id,
        kind: "INSPECTION",
        status: "OPEN",
        title: `Missão Técnica: ${title}`,
      },
    });

    return occurrence;
  },

  // 2. Registra Excedente de Alimentos da Balança (HX711) + Missão de Coleta para ONG
  processDonationAlert: async (
    tx: any,
    organizationId: string,
    weightKg: number,
  ) => {
    // Evita duplicar lote se já houver um disponível aguardando coleta
    const existingBatch = await tx.donationBatch.findFirst({
      where: {
        organizationId,
        status: { in: ["PENDING_REVIEW", "AVAILABLE"] },
        source: "DEVICE",
      },
    });

    if (existingBatch) {
      return existingBatch;
    }

    const batch = await tx.donationBatch.create({
      data: {
        organizationId,
        description: `Excedente de frutas/alimentos registrado automaticamente na Estação SALVA (${weightKg.toFixed(1)} kg)`,
        weightKg,
        status: "AVAILABLE",
        source: "DEVICE",
      },
    });

    await tx.mission.create({
      data: {
        organizationId,
        donationBatchId: batch.id,
        kind: "PICKUP",
        status: "OPEN",
        title: `Coleta e Doação: ${weightKg.toFixed(1)} kg disponíveis`,
      },
    });

    return batch;
  },
};