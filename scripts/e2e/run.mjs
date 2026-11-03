// pnpm test:e2e — jornadas no navegador contra uma instância ISOLADA (porta 3100, banco richards_test).
// Pré-requisitos: `pnpm build`, container do Postgres no ar, Chrome/Edge instalado (CHROME_PATH se não for o padrão).
// Opções: --with-db-outage (para o container db por alguns segundos para testar o erro honesto), --keep (não derruba a instância).
// O banco de DESENVOLVIMENTO nunca é tocado: o nome precisa terminar em _test (conferido aqui e no Postgres).
import "dotenv/config";
import pg from "pg";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { runJourneys } from "./journeys.mjs";

const project = resolve(import.meta.dirname, "../..");
const args = new Set(process.argv.slice(2));
const PORT = Number(process.env.E2E_PORT || 3100);
const base = `http://localhost:${PORT}`;
const url = process.env.TEST_DATABASE_URL;
if (!url || !/_test$/.test(new URL(url).pathname)) { console.error("TEST_DATABASE_URL ausente ou sem sufixo _test: E2E recusado."); process.exit(1); }
const auth = { username: process.env.RICHARDS_OPERATOR_USER, password: process.env.RICHARDS_OPERATOR_PASSWORD };
if (!auth.username || !auth.password) { console.error("Defina RICHARDS_OPERATOR_USER/PASSWORD no .env."); process.exit(1); }
const chromePath = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find(p => existsSync(p));
if (!chromePath) { console.error("Chrome não encontrado: defina CHROME_PATH."); process.exit(1); }
if (!existsSync(join(project, ".next", "BUILD_ID"))) { console.error("Rode `pnpm build` antes do E2E."); process.exit(1); }

// 1. banco de teste limpo + migrations + seed de demonstração
const prep = spawnSync("node scripts/test-db-prepare.mjs", { cwd: project, stdio: "inherit", shell: true });
if (prep.status !== 0) process.exit(prep.status ?? 1);
const client = new pg.Client({ connectionString: url }); await client.connect();
const { rows: [{ name }] } = await client.query("SELECT current_database() AS name");
if (!name.endsWith("_test")) { console.error(`Recusado: conectado em ${name}`); process.exit(1); }
await client.query(`TRUNCATE "AuditEvent","Mission","OccurrenceEvent","Occurrence","TelemetryReading","DonationBatch","RecipientOrganization","Device","Site","User","Organization" CASCADE`);
await client.end();
const seed = spawnSync("pnpm db:seed", { cwd: project, stdio: "inherit", shell: true, env: { ...process.env, DATABASE_URL: url } });
if (seed.status !== 0) process.exit(seed.status ?? 1);

// 2. instância de produção isolada (porta precisa estar livre: servidor antigo serviria chunks de outro build)
const busy = await fetch(`${base}/api/health`).then(() => true, () => false);
if (busy) { console.error(`Porta ${PORT} ocupada por outro servidor. Encerre-o (ou use E2E_PORT) e rode de novo.`); process.exit(1); }
const server = spawn(process.execPath, [join(project, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT)], { cwd: project, env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
let up = false;
for (let i = 0; i < 60 && !up; i++) { try { up = (await fetch(`${base}/api/health`)).ok; } catch {} if (!up) await new Promise(r => setTimeout(r, 1000)); }
if (!up) { server.kill(); console.error(`Instância não respondeu em ${base}.`); process.exit(1); }

// 3. jornadas
const outDir = join(project, ".e2e"); mkdirSync(outDir, { recursive: true });
let failed = 1;
try {
  const results = await runJourneys({ base, project, chromePath, outDir, auth, withDbOutage: args.has("--with-db-outage") });
  failed = results.filter(r => !r.ok).length;
  console.log(`Capturas em ${outDir}`);
} finally {
  if (!args.has("--keep")) server.kill();
}
process.exit(failed ? 1 : 0);
