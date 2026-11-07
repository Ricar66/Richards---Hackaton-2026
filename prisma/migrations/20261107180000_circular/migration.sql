-- CreateEnum
CREATE TYPE "CircularOrigin" AS ENUM ('PREPARATION', 'KITCHEN_UNSERVED', 'BUFFET', 'PLATE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CircularMaterial" AS ENUM ('PLANT_ONLY', 'MIXED_FOOD', 'ANIMAL_FATS', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CircularMethod" AS ENUM ('COMPOSTING', 'BIODIGESTION', 'DISPOSAL');

-- CreateEnum
CREATE TYPE "CircularStatus" AS ENUM ('REGISTERED', 'RESIDUE', 'DONATION_REFERRED', 'SCHEDULED', 'COLLECTED', 'RECEIVED', 'EVIDENCED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CircularEvidenceKind" AS ENUM ('RECEIPT', 'TREATMENT', 'DISPOSAL');

-- CreateTable
CREATE TABLE "CircularPartner" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "source" "DataSource" NOT NULL,
    "methods" "CircularMethod"[],
    "materials" "CircularMaterial"[],
    "authorizationReference" TEXT NOT NULL,
    "reviewedBy" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewExpiresAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CircularPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CircularBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "weightKg" DECIMAL(12,3) NOT NULL,
    "origin" "CircularOrigin" NOT NULL,
    "material" "CircularMaterial" NOT NULL,
    "reason" TEXT NOT NULL,
    "source" "DataSource" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "status" "CircularStatus" NOT NULL DEFAULT 'REGISTERED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "partnerId" TEXT,
    "partnerSnapshot" JSONB,
    "method" "CircularMethod",
    "scheduledAt" TIMESTAMP(3),
    "collectedKg" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "receivedKg" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "confirmedKg" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "firstCollectedAt" TIMESTAMP(3),
    "firstReceivedAt" TIMESTAMP(3),
    "donationBatchId" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CircularBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CircularEvidence" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "kind" "CircularEvidenceKind" NOT NULL,
    "weightKg" DECIMAL(12,3) NOT NULL,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "documentReference" TEXT NOT NULL,
    "reviewedBy" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CircularEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CircularPartner_organizationId_source_active_idx" ON "CircularPartner"("organizationId", "source", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CircularBatch_donationBatchId_key" ON "CircularBatch"("donationBatchId");

-- CreateIndex
CREATE INDEX "CircularBatch_organizationId_source_createdAt_idx" ON "CircularBatch"("organizationId", "source", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CircularBatch_organizationId_requestKey_key" ON "CircularBatch"("organizationId", "requestKey");

-- CreateIndex
CREATE INDEX "CircularEvidence_batchId_createdAt_idx" ON "CircularEvidence"("batchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CircularEvidence_batchId_requestKey_key" ON "CircularEvidence"("batchId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "CircularEvidence_batchId_kind_sha256_key" ON "CircularEvidence"("batchId", "kind", "sha256");

-- AddForeignKey
ALTER TABLE "CircularPartner" ADD CONSTRAINT "CircularPartner_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircularBatch" ADD CONSTRAINT "CircularBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircularBatch" ADD CONSTRAINT "CircularBatch_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircularBatch" ADD CONSTRAINT "CircularBatch_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "CircularPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircularBatch" ADD CONSTRAINT "CircularBatch_donationBatchId_fkey" FOREIGN KEY ("donationBatchId") REFERENCES "DonationBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircularEvidence" ADD CONSTRAINT "CircularEvidence_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CircularBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Regras de conservação e origem também no banco (somente tabelas novas).
ALTER TABLE "CircularBatch" ADD CONSTRAINT "CircularBatch_mass_check" CHECK (
  "weightKg" > 0 AND "collectedKg" >= 0 AND "receivedKg" >= 0 AND "confirmedKg" >= 0
  AND "confirmedKg" <= "receivedKg" AND "receivedKg" <= "collectedKg" AND "collectedKg" <= "weightKg"
);
ALTER TABLE "CircularBatch" ADD CONSTRAINT "CircularBatch_source_check" CHECK (source IN ('MANUAL','SIMULATED'));
ALTER TABLE "CircularPartner" ADD CONSTRAINT "CircularPartner_source_check" CHECK (source IN ('MANUAL','SIMULATED'));
ALTER TABLE "CircularEvidence" ADD CONSTRAINT "CircularEvidence_file_check" CHECK (
  "weightKg" > 0 AND "fileSize" > 0 AND "fileSize" <= 2097152 AND octet_length(content) = "fileSize"
  AND mime IN ('application/pdf','image/png','image/jpeg') AND length(sha256) = 64
);
