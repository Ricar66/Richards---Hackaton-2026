// Simulador de bancada que se comporta como o firmware ESP32: fila curta, retentativa com a MESMA sequence
// e o mesmo tratamento de status HTTP. Toda leitura sai com x-richards-simulator → gravada como SIMULATED.
//
//   pnpm simulate                                    # cenário "leak": fluxo contínuo que deve abrir UMA ocorrência
//   pnpm simulate --scenario normal --samples 12     # uso intermitente: nenhuma ocorrência
//   pnpm simulate --interval 5 --duplicate-rate 0.3 --drop-rate 0.2   # testes de repetição e de rede
//
// Lê RICHARDS_URL (padrão http://localhost:3000) e IOT_DEMO_DEVICE_KEY do ambiente ou do .env.
// Jamais use a credencial de operador aqui.
import "dotenv/config";
import { parseArgs } from "node:util";

const { values: opt } = parseArgs({ options: {
  scenario: { type: "string", default: "leak" },
  samples: { type: "string", default: "7" },
  interval: { type: "string", default: "10" },
  "duplicate-rate": { type: "string", default: "0" },
  "drop-rate": { type: "string", default: "0" },
  "boot-id": { type: "string" },
  device: { type: "string", default: "RICHARDS-FLOW-001" },
} });

const SCENARIOS = {
  leak: () => 2.5,                                       // acima de 1,5 L/min o tempo todo
  normal: i => [2.2, 0, 0, 1.8, 0, 0][i % 6],            // usos curtos, cada um menor que a janela de 30 s
  low: () => 1.0,                                        // contínuo, mas abaixo do limiar
};
const base = (process.env.RICHARDS_URL || "http://localhost:3000").replace(/\/$/, "");
const key = process.env.IOT_DEMO_DEVICE_KEY;
const flowAt = SCENARIOS[opt.scenario];
const samples = Number(opt.samples), intervalS = Number(opt.interval);
const dupRate = Number(opt["duplicate-rate"]), dropRate = Number(opt["drop-rate"]);
if (!key) { console.error("Defina IOT_DEMO_DEVICE_KEY (no ambiente ou no .env)."); process.exit(1); }
if (!flowAt) { console.error(`Cenário desconhecido "${opt.scenario}". Use: ${Object.keys(SCENARIOS).join(", ")}`); process.exit(1); }
if (!(samples > 0) || !(intervalS >= 2)) { console.error("--samples > 0 e --interval >= 2 (segundos)."); process.exit(1); }

const QUEUE_MAX = 12;                                    // igual ao firmware
const bootId = opt["boot-id"] || `sim-${Date.now().toString(36)}`;
const queue = [];
const stats = { captured: 0, accepted: 0, duplicates: 0, injectedDuplicates: 0, retries: 0, simulatedNetworkFailures: 0, dropped: 0, discarded: 0, occurrences: new Set() };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function capture(i) {
  const flowLpm = flowAt(i);
  const reading = { deviceCode: opt.device, bootId, sequence: i, flowLpm, deltaLiters: Math.round(flowLpm * intervalS / 60 * 1000) / 1000, capturedAt: new Date().toISOString() };
  if (queue.length >= QUEUE_MAX) { queue.shift(); stats.dropped++; console.log("DROP fila cheia: leitura mais antiga descartada"); }
  queue.push(reading); stats.captured++;
}

async function post(reading) {
  const res = await fetch(base + "/api/iot/telemetry", { method: "POST", headers: { "Content-Type": "application/json", "x-device-key": key, "x-richards-simulator": "true" }, body: JSON.stringify(reading) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/** Envia a fila em ordem. Para no primeiro erro temporário: a leitura fica para a próxima rodada, com a mesma sequence. */
async function flush() {
  while (queue.length) {
    const r = queue[0];
    if (Math.random() < dropRate) { stats.simulatedNetworkFailures++; console.log(`seq=${r.sequence} REDE (simulada): sem envio, fica na fila`); return; }
    let res;
    try { res = await post(r); } catch (e) { console.log(`seq=${r.sequence} sem conexão (${e.cause?.code ?? e.message}): fica na fila`); stats.retries++; return; }
    const { status, body } = res;
    if (status === 202) {
      queue.shift();
      if (body.duplicate) stats.duplicates++; else stats.accepted++;
      if (body.occurrenceId) stats.occurrences.add(body.occurrenceId);
      console.log(`seq=${r.sequence} ${r.flowLpm.toFixed(2)} L/min -> 202 ${JSON.stringify(body)}`);
      if (Math.random() < dupRate) {                   // retentativa "acidental" da mesma leitura: precisa voltar duplicate:true
        const again = await post(r).catch(() => null);
        stats.injectedDuplicates++;
        console.log(`seq=${r.sequence} REENVIO proposital -> ${again?.status} duplicate=${again?.body?.duplicate}`);
        if (again?.body?.duplicate) stats.duplicates++;
      }
    } else if (status === 400 || status === 422) {
      queue.shift(); stats.discarded++;
      console.log(`seq=${r.sequence} -> ${status} ${body.code ?? ""} ${body.error ?? ""}: descartada (o firmware faz o mesmo)`);
    } else if (status === 401) {
      console.error(`seq=${r.sequence} -> 401 ${body.code ?? ""}: chave recusada. Confira IOT_DEMO_DEVICE_KEY e o seed. Encerrando.`);
      process.exit(2);
    } else {
      stats.retries++;
      console.log(`seq=${r.sequence} -> ${status} ${body.code ?? ""}: falha temporária, fica na fila`);
      return;
    }
  }
}

console.log(`RICHARDS simulador · cenário=${opt.scenario} · ${samples} amostras a cada ${intervalS}s · bootId=${bootId} · ${base}`);
for (let i = 0; i < samples; i++) {
  capture(i);
  await flush();
  if (i < samples - 1) await sleep(intervalS * 1000);
}
for (let attempt = 0; queue.length && attempt < 30; attempt++) { await sleep(2000); await flush(); }   // drena a fila após queda

const summary = { ...stats, occurrences: [...stats.occurrences], pendingInQueue: queue.length };
console.log("\nResumo: " + JSON.stringify(summary));
if (opt.scenario === "leak") console.log(summary.occurrences.length ? "Ocorrência associada ao fluxo contínuo: " + summary.occurrences.join(", ") : "Nenhuma ocorrência: a janela de 30 s não foi atingida (aumente --samples ou --interval).");
process.exit(queue.length ? 1 : 0);
