-- Passaporte do Alimento (08/11/2026). Migração ADITIVA: duas colunas opcionais no lote, um índice único e uma
-- chave estrangeira. Nenhuma linha existente é alterada; lote antigo fica sem passaporte até o operador emitir.

-- AlterTable
ALTER TABLE "DonationBatch" ADD COLUMN     "originEquipmentId" TEXT,
ADD COLUMN     "passportToken" TEXT;
-- CreateIndex
CREATE UNIQUE INDEX "DonationBatch_passportToken_key" ON "DonationBatch"("passportToken");
-- AddForeignKey
ALTER TABLE "DonationBatch" ADD CONSTRAINT "DonationBatch_originEquipmentId_fkey" FOREIGN KEY ("originEquipmentId") REFERENCES "ColdEquipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
