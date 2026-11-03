import type { OverviewDTO } from "../domain/types";
export function demoOverview(): OverviewDTO {
 const labels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
 return {
  dataset: "SIMULATED", updatedAt: new Date().toISOString(), business: "Mercado Aurora · Unidade Centro",
  metrics: { observedLiters: 842.6, openAlerts: 2, deliveredKg: 8.5, resolved: 1, averageResponseMin: 19, devices: 1 },
  trend: labels.map((label,i)=>({label, water:[128,113,142,107,135,124,93][i], reference:[122,122,122,122,122,122,122][i]})),
  distribution: [{ name: "Resolvidas", value: 1, color: "#20a48b" },{ name: "Abertas", value: 1, color: "#e59d55" },{ name: "Em análise", value: 1, color: "#6099d1" }],
  occurrences: [
   { id:"richards-oc-01", title:"Fluxo contínuo fora de horário",description:"Vazão suspeita exige verificação.",severity:"HIGH",status:"OPEN",source:"SIMULATED",time:new Date(Date.now()-16*60000).toISOString(),liters:12.4 },
   { id:"richards-oc-03",title:"Conectividade oscilante",description:"Instabilidade de comunicação.",severity:"LOW",status:"ACKNOWLEDGED",source:"SIMULATED",time:new Date(Date.now()-53*60000).toISOString(),liters:null },
   { id:"richards-oc-02",title:"Consumo acima da faixa configurada",description:"Fluxo demonstrativo encerrado.",severity:"MEDIUM",status:"RESOLVED",source:"SIMULATED",time:new Date(Date.now()-2*86400000).toISOString(),liters:8.2 },
  ],
  donations: [
   { id:"richards-don-03",description:"Bananas · lote em avaliação",kg:4.2,status:"PENDING_REVIEW",source:"SIMULATED",recipient:"Aguardando",createdAt:new Date(Date.now()-3600000).toISOString() },
   { id:"richards-don-02",description:"Hortaliças · lote de demonstração",kg:6,status:"RESERVED",source:"SIMULATED",recipient:"Instituição Parceira",createdAt:new Date(Date.now()-6*3600000).toISOString() },
   { id:"richards-don-01",description:"Frutas selecionadas · caixa mista",kg:8.5,status:"DELIVERED",source:"SIMULATED",recipient:"Instituição Parceira",createdAt:new Date(Date.now()-3*86400000).toISOString() },
  ],
  devices:[{ id:"richards-flow-01",code:"RICHARDS-FLOW-001",label:"Sensor de vazão · Linha 01",kind:"FLOW",state:"ONLINE",lastSeen:new Date(Date.now()-19000).toISOString()}],
 };
}
