-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'OPERATOR', 'ANALYST', 'RECIPIENT');

-- CreateEnum
CREATE TYPE "DeviceKind" AS ENUM ('FLOW', 'SCALE', 'TEMPERATURE');

-- CreateEnum
CREATE TYPE "DeviceState" AS ENUM ('ONLINE', 'OFFLINE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('DEVICE', 'SIMULATED', 'MANUAL');

-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "OccurrenceSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "OccurrenceKind" AS ENUM ('UNUSUAL_FLOW', 'DEVICE_OFFLINE', 'TEMPERATURE_EXCURSION', 'MANUAL');

-- CreateEnum
CREATE TYPE "DonationStatus" AS ENUM ('PENDING_REVIEW', 'AVAILABLE', 'RESERVED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MissionKind" AS ENUM ('INSPECTION', 'PICKUP');

-- CreateEnum
CREATE TYPE "MissionStatus" AS ENUM ('OPEN', 'ASSIGNED', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OPERATOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "DeviceKind" NOT NULL,
    "state" "DeviceState" NOT NULL DEFAULT 'OFFLINE',
    "apiKeyHash" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "calibrationPulsesPerLiter" DOUBLE PRECISION NOT NULL DEFAULT 450,
    "minFlowLpm" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "continuousSeconds" INTEGER NOT NULL DEFAULT 30,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelemetryReading" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "bootId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "source" "DataSource" NOT NULL,
    "flowLpm" DECIMAL(12,3) NOT NULL,
    "deltaLiters" DECIMAL(12,3) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelemetryReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Occurrence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "deviceId" TEXT,
    "kind" "OccurrenceKind" NOT NULL,
    "severity" "OccurrenceSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "OccurrenceStatus" NOT NULL DEFAULT 'OPEN',
    "source" "DataSource" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "suspectedLiters" DECIMAL(12,3),
    "verificationNote" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Occurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OccurrenceEvent" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OccurrenceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipientOrganization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RecipientOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DonationBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recipientId" TEXT,
    "description" TEXT NOT NULL,
    "weightKg" DECIMAL(12,3) NOT NULL,
    "status" "DonationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
    "safetyVerifiedBy" TEXT,
    "safetyVerifiedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DonationBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "occurrenceId" TEXT,
    "donationBatchId" TEXT,
    "kind" "MissionKind" NOT NULL,
    "status" "MissionStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "assignedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Device_code_key" ON "Device"("code");

-- CreateIndex
CREATE INDEX "Device_organizationId_kind_idx" ON "Device"("organizationId", "kind");

-- CreateIndex
CREATE INDEX "TelemetryReading_deviceId_capturedAt_idx" ON "TelemetryReading"("deviceId", "capturedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "TelemetryReading_deviceId_bootId_sequence_key" ON "TelemetryReading"("deviceId", "bootId", "sequence");

-- CreateIndex
CREATE INDEX "Occurrence_organizationId_status_openedAt_idx" ON "Occurrence"("organizationId", "status", "openedAt" DESC);

-- CreateIndex
CREATE INDEX "DonationBatch_organizationId_status_createdAt_idx" ON "DonationBatch"("organizationId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Mission_organizationId_status_createdAt_idx" ON "Mission"("organizationId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_at_idx" ON "AuditEvent"("organizationId", "at" DESC);

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemetryReading" ADD CONSTRAINT "TelemetryReading_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccurrenceEvent" ADD CONSTRAINT "OccurrenceEvent_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "Occurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationBatch" ADD CONSTRAINT "DonationBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationBatch" ADD CONSTRAINT "DonationBatch_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "RecipientOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "Occurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_donationBatchId_fkey" FOREIGN KEY ("donationBatchId") REFERENCES "DonationBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

