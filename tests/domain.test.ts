import { test } from "node:test";
import assert from "node:assert/strict";
import { FlowAlertPolicy } from "../src/modules/monitoring/domain/flow-alert-policy";
const t=(sec:number)=>new Date(1760000000000+sec*1000);
test("fluxo contínuo abre alerta após limite",()=>{
 const policy=new FlowAlertPolicy(1.5,30);
 const samples=[0,10,20,30,40].map(sec=>({capturedAt:t(sec),flowLpm:2,deltaLiters:0.33}));
 const result=policy.evaluate(samples);
 assert.equal(result.suspicious,true);assert.equal(result.observedSeconds,40);
});
test("consumo legítimo interrompe sequência",()=>{
 const p=new FlowAlertPolicy(1.5,30);
 const readings=[0,10,20,30,40].map((sec,i)=>({capturedAt:t(sec),flowLpm:i===3?0.1:2,deltaLiters:0.33}));
 assert.equal(p.evaluate(readings).suspicious,false);
});
test("amostras fora de ordem são ordenadas antes da avaliação",()=>{
 const p=new FlowAlertPolicy(1.5,30);
 const shuffled=[30,0,20,10].map(sec=>({capturedAt:t(sec),flowLpm:2,deltaLiters:0.25}));
 const r=p.evaluate(shuffled);
 assert.equal(r.suspicious,true);assert.equal(r.observedSeconds,30);assert.equal(r.suspectVolumeLiters,1);
});
test("buraco maior que 45 s entre leituras quebra a continuidade",()=>{
 const p=new FlowAlertPolicy(1.5,30);
 const gap=[0,60,70].map(sec=>({capturedAt:t(sec),flowLpm:2,deltaLiters:0.25}));
 const r=p.evaluate(gap);
 assert.equal(r.suspicious,false);assert.equal(r.observedSeconds,10);
});
test("sem amostras ou última abaixo do limiar: não suspeito",()=>{
 const p=new FlowAlertPolicy(1.5,30);
 assert.equal(p.evaluate([]).suspicious,false);
 assert.equal(p.evaluate([0,10,20,40].map((sec,i)=>({capturedAt:t(sec),flowLpm:i===3?1.4:2,deltaLiters:0.25}))).suspicious,false);
 assert.throws(()=>new FlowAlertPolicy(0,30));
});
