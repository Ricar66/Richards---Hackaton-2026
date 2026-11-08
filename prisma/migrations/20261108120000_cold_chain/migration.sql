-- Cadeia do frio: equipamentos monitorados e série de temperatura (RDC 216/2004, item 4.8.18).
-- Aditiva: só cria tipo, tabelas, índices e chaves; não altera nem apaga dados existentes.

-- CreateEnum
CREATE TYPE "ColdKind" AS ENUM ('REFRIGERATOR', 'FREEZER', 'COLD_ROOM', 'HOT_HOLDING', 'AMBIENT');

-- CreateTable
CREATE TABLE "ColdEquipment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "ColdKind" NOT NULL,
    "minC" DOUBLE PRECISION,
    "maxC" DOUBLE PRECISION,
    "sensorDeviceId" TEXT,
    "sensorChannel" TEXT NOT NULL DEFAULT 'TEMP',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ColdEquipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemperatureReading" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "source" "DataSource" NOT NULL,
    "temperatureC" DECIMAL(6,2) NOT NULL,
    "humidityPct" DECIMAL(5,1),
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemperatureReading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ColdEquipment_code_key" ON "ColdEquipment"("code");

-- CreateIndex
CREATE INDEX "ColdEquipment_organizationId_active_idx" ON "ColdEquipment"("organizationId", "active");

-- CreateIndex
CREATE INDEX "ColdEquipment_sensorDeviceId_idx" ON "ColdEquipment"("sensorDeviceId");

-- CreateIndex
CREATE INDEX "TemperatureReading_equipmentId_capturedAt_idx" ON "TemperatureReading"("equipmentId", "capturedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "TemperatureReading_equipmentId_capturedAt_source_key" ON "TemperatureReading"("equipmentId", "capturedAt", "source");

-- AddForeignKey
ALTER TABLE "ColdEquipment" ADD CONSTRAINT "ColdEquipment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ColdEquipment" ADD CONSTRAINT "ColdEquipment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ColdEquipment" ADD CONSTRAINT "ColdEquipment_sensorDeviceId_fkey" FOREIGN KEY ("sensorDeviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemperatureReading" ADD CONSTRAINT "TemperatureReading_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "ColdEquipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

