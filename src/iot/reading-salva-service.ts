import { alertService } from "./alert-service";
import { getDb } from "../lib/db";

export interface PayloadSalvaSensors {
  dispositivo_id: string; // Ex: "hortifruti_01" (campo 'code' da tabela Device)
  PESO: number;           // Balança HX711 em kg
  VAZAO: number;          // Potenciômetro / Sensor de Vazão em L/min
  TEMP: number;           // Sensor DHT11 em °C
  UMIDADE: number;        // Sensor DHT11 em %
}

const LIMITE_PESO_DOACAO_KG = 5.0;
const LIMITE_VAZAO_AGUA_LMIN = 8.0;
const LIMITE_TEMP_MAX_C = 28.0;

let sequenceCounter = Math.floor(Date.now() / 1000);

export async function processMessageSensors(payload: PayloadSalvaSensors) {
  try {
    const prisma = getDb();

    // 1. Busca o dispositivo pelo código enviado no JSON ou pega o primeiro cadastrado
    let device = await prisma.device.findUnique({
      where: { code: payload.dispositivo_id },
    });

    if (!device) {
      device = await prisma.device.findFirst();
    }

    if (!device) {
      console.warn(
        `[IoT] Nenhum Device cadastrado no banco para vincular a leitura de [${payload.dispositivo_id}].`,
      );
      return;
    }

    // Garante tipagem não-nula dentro da closure da transação do TypeScript
    const targetDevice = device;
    const now = new Date();
    sequenceCounter += 1;

    const deltaLiters = Number(((payload.VAZAO * 2) / 60).toFixed(3));

    await prisma.$transaction(async (tx) => {
      // Atualiza status do ESP32 para ONLINE
      await tx.device.update({
        where: { id: targetDevice.id },
        data: {
          state: "ONLINE",
          lastSeenAt: now,
        },
      });

      // Salva a leitura na tabela TelemetryReading
      await tx.telemetryReading.create({
        data: {
          deviceId: targetDevice.id,
          bootId: "esp32-mqtt-live",
          sequence: sequenceCounter,
          source: "DEVICE",
          flowLpm: payload.VAZAO,
          deltaLiters: deltaLiters,
          capturedAt: now,
        },
      });

      // GATILHO 1: Vazamento de Água (Potenciômetro)
      if (payload.VAZAO > LIMITE_VAZAO_AGUA_LMIN) {
        await alertService.processOccurrenceAlert(
          tx,
          targetDevice.organizationId,
          targetDevice.siteId,
          targetDevice.id,
          "UNUSUAL_FLOW",
          "HIGH",
          "Possível vazamento de água",
          `Fluxo contínuo de ${payload.VAZAO.toFixed(1)} L/min detectado fora do horário.`,
          payload.VAZAO,
        );
      }

      // GATILHO 2: Temperatura Crítica (DHT11)
      if (payload.TEMP > LIMITE_TEMP_MAX_C) {
        await alertService.processOccurrenceAlert(
          tx,
          targetDevice.organizationId,
          targetDevice.siteId,
          targetDevice.id,
          "TEMPERATURE_EXCURSION",
          "MEDIUM",
          "Temperatura fora do ideal",
          `Sensor registrou ${payload.TEMP.toFixed(1)} °C (Umidade: ${payload.UMIDADE.toFixed(0)}%). Verificar equipamento.`,
        );
      }

      // GATILHO 3: Excedente de Alimentos na Balança (HX711)
      if (payload.PESO >= LIMITE_PESO_DOACAO_KG) {
        await alertService.processDonationAlert(
          tx,
          targetDevice.organizationId,
          payload.PESO,
        );
      }
    });

    console.log(
      `[DB] Telemetria processada com sucesso para o dispositivo [${targetDevice.code}]!`,
    );
  } catch (error) {
    console.error("[DB] Erro ao processar leituras dos sensores no Prisma:", error);
  }
}