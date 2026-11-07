// Prévia isolada para revisão visual. Nenhum acesso ao banco, API ou hardware; TODOS os dados são SIMULATED.
// Empacota os componentes reais; só next/dynamic é adaptado para React.lazy fora do Next.
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('tsx'))('esbuild');
const root = resolve(import.meta.dirname, '../..'), out = resolve(root, '.e2e/twin-preview');
await mkdir(out, { recursive: true });
const result = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {LiveStage} from './src/components/stage/live-stage';
const counter={value:0,provenance:'NONE',sources:[]};
let sequence=1, flow=4.28, stopped=false;
const now=()=>new Date().toISOString();
const snapshot=()=>({serverTime:now(),organization:{name:'ENSAIO VISUAL · DADOS SIMULADOS',city:'Sem conexão com hardware',sites:[]},
devices:[{id:'qa-sensor',code:'QA-SIM',label:'Fixture de revisão visual',kind:'FLOW',siteName:'Ensaio',minFlowLpm:1.5,continuousSeconds:30,lastSeenAt:now(),connectivity:'ONLINE',rule:null}],
readings:[{deviceId:'qa-sensor',bootId:'qa-visual',sequence,capturedAt:stopped?new Date(Date.now()-120000).toISOString():now(),flowLpm:flow,deltaLiters:0,source:'SIMULATED'}],activeOccurrences:[],
today:{from:now(),deliveredKg:counter,deliveredBatches:0,pendingReview:counter,activeOccurrences:counter},pendingScaleLots:[],audit:[]});
const streams=new Set();
window.fetch=async()=>new Response(JSON.stringify(snapshot()),{headers:{'Content-Type':'application/json'}});
class FixtureStream extends EventTarget { constructor(){super(); streams.add(this);setTimeout(()=>this.dispatchEvent(new MessageEvent('hello',{data:JSON.stringify({v:1,serverTime:now(),listening:true})})),0);}close(){streams.delete(this);} }
window.EventSource=FixtureStream;
function emit(value,stale=false){flow=value;stopped=stale;sequence++;for(const stream of streams){stream.dispatchEvent(new MessageEvent('heartbeat',{data:JSON.stringify({listening:true})}));stream.dispatchEvent(new MessageEvent('live',{data:JSON.stringify({v:1,type:'resync',orgId:'qa',emittedAt:now(),reason:'fixture visual SIMULATED'})}));}}
const timer=setInterval(()=>{if(!stopped)emit(flow);},4000);
document.querySelector('#qa-flow').onclick=()=>emit(4.28);document.querySelector('#qa-zero').onclick=()=>emit(0);document.querySelector('#qa-stale').onclick=()=>emit(4.28,true);
createRoot(document.querySelector('#root')).render(<LiveStage initial={snapshot()} initialError={null} pinnedCode={null}/>);
` }, bundle: true, minify: true, write: false, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' }, tsconfig: resolve(root, 'tsconfig.json'),
plugins: [{ name: 'standalone-dynamic', setup(build) { build.onResolve({ filter: /^next\/dynamic$/ }, () => ({ path: 'dynamic', namespace: 'qa' })); build.onLoad({ filter: /.*/, namespace: 'qa' }, () => ({ contents: `import React,{lazy,Suspense} from 'react';export default function dynamic(load){const C=lazy(load);return function Dynamic(props){return React.createElement(Suspense,{fallback:null},React.createElement(C,props));}}`, resolveDir: root })); } }] });
const packed = gzipSync(result.outputFiles[0].contents).toString('base64');
const css = await readFile(resolve(root, 'src/app/(palco)/stage.css'), 'utf8');
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>RICHARDS · ensaio visual SIMULADO</title><style>*{box-sizing:border-box}html,body{margin:0;background:#0f2128}button{font-family:inherit}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}${css}
#qa-bar{position:fixed;right:12px;bottom:0;z-index:100;font:11px system-ui;color:#b6a3e2;background:#09171e;padding:5px;border:1px solid #b6a3e2}#qa-bar button{margin-left:4px;font:inherit;cursor:pointer}</style><body><div id="root"></div><aside id="qa-bar">ENSAIO SIMULADO <button id="qa-flow">Fixture: fluxo</button><button id="qa-zero">Fixture: zero</button><button id="qa-stale">Fixture: sem leitura</button></aside><script type="module">const packed=Uint8Array.from(atob('${packed}'),c=>c.charCodeAt(0));const js=await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).text();await import(URL.createObjectURL(new Blob([js],{type:'text/javascript'})));</script></body></html>`;
await writeFile(resolve(out, 'index.html'), html);
await writeFile(resolve(out, 'url.txt'), 'data:text/html;base64,' + Buffer.from(html).toString('base64'));
console.log('PRÉVIA SIMULADA', resolve(out, 'index.html'), 'bytes', Buffer.byteLength(html));
