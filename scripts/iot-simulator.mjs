// Exemplo: RICHARDS_URL=http://localhost:3000 IOT_DEMO_DEVICE_KEY=... pnpm simulate
const base=process.env.RICHARDS_URL||'http://localhost:3000';
const key=process.env.IOT_DEMO_DEVICE_KEY;
if(!key){console.error('Defina IOT_DEMO_DEVICE_KEY; jamais use a credencial de operador.');process.exit(1)}
const bootId=`cli-${Date.now()}`;
for(let i=0;i<7;i++){
 const data={deviceCode:'RICHARDS-FLOW-001',bootId,sequence:i,flowLpm:2.5,deltaLiters:0.4167,capturedAt:new Date().toISOString()};
 try {const response=await fetch(base+'/api/iot/telemetry',{method:'POST',headers:{'Content-Type':'application/json','x-device-key':key,'x-richards-simulator':'true'},body:JSON.stringify(data)});console.log(i,response.status,await response.text());}
 catch(e){console.error('Falha de conexão:',e.message)}
 if(i<6)await new Promise(r=>setTimeout(r,10000));
}
console.log('Verifique se surgiu ocorrência real do simulador após >= 30 segundos.');
