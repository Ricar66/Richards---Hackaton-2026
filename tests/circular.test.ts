import test from "node:test";
import assert from "node:assert/strict";
import { batchInput, partnerInput, actionInput, evidenceInput, requireMass, pastDate, grams, CircularError, MAX_FILE_BYTES } from "../src/modules/circular/domain/contracts";
import { decodeEvidence } from "../src/modules/circular/infrastructure/evidence-file";
import { readJson, circularActor } from "../src/modules/circular/infrastructure/http";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CircularWorkspace } from "../src/components/circular/workspace";
const input = { requestKey: "test-request-000001", siteId: "site", description: "Vegetais de ensaio", weightKg: 5, origin: "PREPARATION", material: "PLANT_ONLY", reason: "Cascas segregadas", source: "SIMULATED", occurredAt: "2026-11-07T12:00:00Z" };
test("Circular: contratos estritos, origem explícita e precisão de gramas", () => {
  assert(batchInput.safeParse(input).success);
  for (const patch of [{source:"DEVICE"},{weightKg:0},{weightKg:-1},{weightKg:0.0001},{weightKg:Infinity},{extra:true}]) assert(!batchInput.safeParse({...input,...patch}).success);
  assert.equal(grams(0.101),101); requireMass(1000,999); assert.throws(()=>requireMass(999,1000),CircularError); assert.throws(()=>requireMass(1,0),CircularError);
});
test("Circular: triagem, operador e comprovante exigem declaração humana",()=>{
  assert(!actionInput.safeParse({action:"TRIAGE",version:0,decision:"RESIDUE",origin:"PREPARATION",material:"PLANT_ONLY",reviewedBy:"Teste",note:"Triagem de ensaio",attested:false}).success);
  assert(!partnerInput.safeParse({}).success);assert(!evidenceInput.safeParse({}).success);
  assert.throws(()=>pastDate("2026-11-08T00:00:00Z",new Date("2026-11-07T00:00:00Z")),CircularError);
  assert.throws(()=>pastDate("2026-11-06T00:00:00Z",new Date("2026-11-07T00:00:00Z"),new Date("2026-11-06T12:00:00Z")),CircularError);
});
test("Circular: conteúdo, tamanho e base64 dos documentos são conferidos sem execução",()=>{
  const pdf=Buffer.from("%PDF-1.4\nsoftware fixture only\n%%EOF");
  const decoded=decodeEvidence({mime:"application/pdf",base64:pdf.toString("base64")});assert.equal(decoded.bytes.length,pdf.length);assert.equal(decoded.sha256.length,64);
  assert.throws(()=>decodeEvidence({mime:"image/png",base64:pdf.toString("base64")}),CircularError);
  assert.throws(()=>decodeEvidence({mime:"application/pdf",base64:"!!!"}),CircularError);
  assert.throws(()=>decodeEvidence({mime:"application/pdf",base64:Buffer.alloc(MAX_FILE_BYTES+1).toString("base64")}),CircularError);
});
test("Circular: corpo limitado, feature desligada e autenticação fecham antes do banco",async()=>{
  await assert.rejects(readJson(new Request("http://localhost",{method:"POST",body:"x".repeat(200)}),100),/limite/);
  await assert.rejects(readJson(new Request("http://localhost",{method:"POST",body:"no-json"})),/JSON/);
  const before=process.env.CIRCULAR_ENABLED;
  try{process.env.CIRCULAR_ENABLED="false";assert.throws(()=>circularActor(new Request("http://localhost")),/ativação/);process.env.CIRCULAR_ENABLED="true";assert.throws(()=>circularActor(new Request("http://localhost")),/autenticado/);assert.equal(circularActor(new Request("http://localhost",{headers:{"x-richards-actor":"operador:teste"}})),"operador:teste");}finally{if(before===undefined)delete process.env.CIRCULAR_ENABLED;else process.env.CIRCULAR_ENABLED=before;}
});
test("Circular: tela desligada mostra cenário ilustrativo sem alegar massa tratada",()=>{
  const html=renderToStaticMarkup(createElement(CircularWorkspace,{enabled:false}));assert.match(html,/Ativação pendente/);assert.match(html,/Cenário ilustrativo/);assert.match(html,/130/);assert.match(html,/nenhuma/);assert.doesNotMatch(html,/Registrar para triagem/);
});
