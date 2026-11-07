import "dotenv/config";
import { getDb } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import { MqttIngestion } from "./mqtt-ingestion";
import { loadMqttConfig } from "./mqtt-payload";
const USAGE=`Bancada virtual de água (tudo SIMULATED, grava no banco do DATABASE_URL):
  pnpm bancada [cenário]        cenários: vazao (padrão), pico, ocioso, palco
  pnpm bancada --cenario palco  forma antiga, ainda aceita
  pnpm palco:checar             só leitura: confere o medidor e a regra, não grava nada
  pnpm bancada --ajuda          esta ajuda`;
// Opção desconhecida NUNCA vira gravação: antes, "--ajuda" (ou qualquer erro de digitação) começava a gravar leituras.
const args=process.argv.slice(2);
if(args.some(a=>a==="--ajuda"||a==="--help"||a==="-h")){console.log(USAGE);process.exit(0);}
const known=new Set(["--checar","--cenario"]),unknown=args.filter((a,i)=>a.startsWith("-")&&!known.has(a)&&args[i-1]!=="--cenario");
if(unknown.length){console.error(`Opção desconhecida: ${unknown.join(" ")}. Nada foi gravado.\n${USAGE}`);process.exit(2);}
const check=args.includes("--checar"),named=args.indexOf("--cenario"),scenario=(named>=0?args[named+1]:args.find(x=>!x.startsWith("-")))??"vazao";
if(!["vazao","pico","ocioso","palco"].includes(scenario))throw new Error("Cenários hídricos: vazao, pico, ocioso, palco. Todos SIMULATED.");
{const u=new URL(process.env.DATABASE_URL??"postgresql://?/?");if(!check)console.log(`[BANCADA ÁGUA] gravando leituras SIMULATED em ${u.hostname}${u.port?":"+u.port:""}${u.pathname} (Ctrl+C para parar)`);}
const code=process.env.BANCADA_DEVICE_CODE??"RICHARDS-FLOW-001",device=await getDb().device.findFirst({where:{organizationId:DEMO_ORG_ID,code,kind:"FLOW"}});if(!device)throw new Error("Cadastre o medidor ou configure BANCADA_DEVICE_CODE");
console.log(`[BANCADA ÁGUA] ${code} · ${check?"checagem somente leitura":"SIMULATED"} · ${device.minFlowLpm} L/min por ${device.continuousSeconds}s`);
if(check){await getDb().$disconnect();process.exit(0);}if(process.env.DEMO_MODE!=="true")throw new Error("Bancada simulada exige DEMO_MODE=true");
const cfg=loadMqttConfig();cfg.simulated=new Set(["VAZAO"]);const ingest=new MqttIngestion(cfg,()=>new Date(),{channel:"bancada-virtual"});let stop=false;process.on("SIGINT",()=>{stop=true;});process.on("SIGTERM",()=>{stop=true;});
try{for(let t=0;!stop;t+=2){const flow=scenario==="ocioso"?0:scenario==="pico"?(t%20<8?2.4:0):t<46?2.4:0;const r=await ingest.handle({dispositivo_id:code,VAZAO:flow});console.log(`[SIMULATED] T+${t}s · ${flow} L/min · ${r.status}`);if(t>=70)break;await new Promise(r=>setTimeout(r,2000));}}finally{await getDb().$disconnect();}
