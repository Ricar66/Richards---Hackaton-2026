// Prepara o banco de TESTE de integração: cria se não existir e aplica as migrations versionadas.
// Nunca toca no banco de desenvolvimento: recusa qualquer nome que não termine em _test.
import "dotenv/config";
import { spawnSync } from "node:child_process";
import pg from "pg";

const url = process.env.TEST_DATABASE_URL;
if (!url) { console.error("Defina TEST_DATABASE_URL no .env (veja .env.example)."); process.exit(1); }
const target = new URL(url);
const name = target.pathname.slice(1);
if (!/^[a-z0-9_]+_test$/.test(name)) { console.error(`Recusado: o banco de teste precisa terminar em _test (recebido "${name}").`); process.exit(1); }

const admin = new URL(url);
admin.pathname = "/postgres";
admin.search = "";
const client = new pg.Client({ connectionString: admin.toString(), connectionTimeoutMillis: 5000 });
await client.connect();
const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
if (exists.rowCount === 0) { await client.query(`CREATE DATABASE "${name}"`); console.log(`Banco ${name} criado.`); }
await client.end();

const result = spawnSync("pnpm exec prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
