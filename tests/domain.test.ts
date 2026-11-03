import { test } from "node:test";
import assert from "node:assert/strict";
import { FlowAlertPolicy } from "../src/modules/monitoring/domain/flow-alert-policy";
import { DonationWorkflow } from "../src/modules/donations/domain/donation-workflow";
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
test("não pode confirmar doação sem verificação",()=>{
 assert.throws(()=>DonationWorkflow.assertTransition('PENDING_REVIEW','AVAILABLE',false,false));
 assert.doesNotThrow(()=>DonationWorkflow.assertTransition('PENDING_REVIEW','AVAILABLE',true,false));
});
test("não pode entregar sem receptor",()=>{
 assert.throws(()=>DonationWorkflow.assertTransition('RESERVED','DELIVERED',true,false));
 assert.doesNotThrow(()=>DonationWorkflow.assertTransition('RESERVED','DELIVERED',true,true));
});
