-- Fase 4: entrega documentada (quem recebeu na instituição) e cancelamento com motivo. Só adiciona colunas anuláveis.
ALTER TABLE "DonationBatch" ADD COLUMN "receivedBy" TEXT;
ALTER TABLE "DonationBatch" ADD COLUMN "cancelReason" TEXT;
