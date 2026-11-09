// Prévia LOCAL das quatro maquetes com o componente de produção. Não acessa API, banco ou hardware.
// O operador escolhe explicitamente a fixture SIMULADA, vinculada a UM ponto (nunca ao prédio inteiro).
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('tsx'))('esbuild');
const root = resolve(import.meta.dirname, '../..');
export const out = resolve(root, '.e2e/map-preview');
export async function prepareMapPreview() {
  await mkdir(out, { recursive: true });
  const result = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React,{useEffect,useState} from 'react';import{createRoot}from'react-dom/client';
import Map3D from './src/components/water-map/map-3d';
import{template,KIND_LABEL}from'./src/modules/water-map/domain/layout';
const qa=window.__mapQA={ready:false,stats:null,failure:null,kind:'HOUSE',reading:'none',still:false};
function Preview(){
 const[kind,setKind]=useState('HOUSE'),[reading,setReading]=useState('none'),[still,setStill]=useState(false),[selected,setSelected]=useState('supply'),[ready,setReady]=useState(false),[failure,setFailure]=useState('');
 const layout=template(kind),point=layout.nodes.find(n=>n.kind==='OUTLET');
 if(reading!=='none'&&point)point.deviceId='qa-simulated';
 const nodes=Object.fromEntries(layout.nodes.map(n=>[n.id,{state:n.deviceId?(reading==='flow'?'FLOW':reading==='zero'?'IDLE':'STALE'):'UNMETERED',flowLpm:n.deviceId?(reading==='zero'?0:4.2):null,alert:false}]));
 useEffect(()=>{Object.assign(qa,{kind,reading,still,ready,failure,setKind,setReading,setStill});},[kind,reading,still,ready,failure]);
 const pick=k=>{setKind(k);setSelected('supply');setReading('none');};
 return <main className="hyd-workspace"><header className="qa-head"><div><p>RICHARDS · REVISÃO DE MAQUETES</p><h1>Arquitetura para entender a operação.</h1><small>Modelos ilustrativos · escala aproximada · sem conexão com hardware</small></div><strong>ENSAIO SIMULADO</strong></header>
 <nav aria-label="Modelo de ensaio">{Object.entries(KIND_LABEL).map(([k,l])=><button key={k} data-kind={k} aria-pressed={kind===k} onClick={()=>pick(k)}>{l}</button>)}</nav>
 <div className="qa-controls"><label>Fixture de telemetria<select aria-label="Fixture de telemetria" value={reading} onChange={e=>setReading(e.target.value)}><option value="none">Sem medidor · sem leitura</option><option value="flow">SIMULADO · 4,2 L/min em um ponto</option><option value="zero">SIMULADO · zero em um ponto</option><option value="stale">SIMULADO · leitura antiga</option></select></label><button aria-pressed={still} onClick={()=>setStill(v=>!v)}>Pausar fixture</button><span>{layout.nodes.filter(n=>n.deviceId).length}/{layout.nodes.length} pontos instrumentados nesta fixture</span></div>
 <section className="hyd-3d-wrap qa-wrap" data-ready={ready} data-failure={failure}>
 <Map3D layout={layout} nodes={nodes} simulated selected={selected} still={still} onSelect={setSelected} onReady={()=>setReady(true)} onFail={reason=>{qa.failure=reason;setFailure(reason);}} onStats={stats=>qa.stats=stats}/>
 </section>
 <p role="status">{failure?'3D NÃO EXECUTADO: '+failure:'Apenas o ponto vinculado pode exibir fluxo. Zero, leitura antiga e sem medidor ficam imóveis.'}</p>
 <div className="hyd-point-list">{layout.nodes.map((n,i)=><button key={n.id} aria-pressed={selected===n.id} onClick={()=>setSelected(n.id)}><b>{i+1}. {n.label}</b><small>{n.deviceId?'Fixture SIMULADA':'Não instrumentado'}</small></button>)}</div>
 </main>;
}createRoot(document.querySelector('#root')).render(<Preview/>);
` }, bundle: true, write: false, minify: true, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' }, tsconfig: resolve(root, 'tsconfig.json') });
  const css = await readFile(resolve(root, 'src/components/water-map/workspace.css'), 'utf8');
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RICHARDS · maquetes · ensaio simulado</title><style>
*{box-sizing:border-box}body{margin:0;background:#0b191f;color:#e0eaec;font:14px system-ui;--ink:#e0eaec;--muted:#9cb0b7;--line:#29434d;--surface:#10232b;--font-ui:system-ui}button,select{font:inherit}button{cursor:pointer}nav,.qa-controls{display:flex;gap:8px;flex-wrap:wrap;align-items:center}nav button,.qa-controls button{padding:12px;background:#122b34;border:1px solid #3d606c;color:#d7ecef;border-radius:8px}button[aria-pressed=true]{border-color:#71c6ad}.qa-head{display:flex;justify-content:space-between;gap:12px}.qa-head strong{align-self:start;color:#c9a5ff;border:1px solid;padding:10px;font-size:11px}.qa-head h1{font-size:28px;max-width:620px;letter-spacing:-.04em;margin:10px 0}.qa-head p{font-size:10px;letter-spacing:.15em;color:#80b6ac}.qa-head small{color:#9cb0b7}.qa-controls span{font-size:11px;color:#9cb0b7}.qa-controls label{max-width:100%}.qa-controls select{max-width:100%}${css}
.qa-wrap{height:620px;aspect-ratio:auto;min-height:0}.qa-wrap:fullscreen{height:100dvh}@media(max-width:650px){.hyd-workspace{padding:12px;gap:14px}.qa-head{display:block}.qa-head strong{display:inline-block;margin-top:10px}.qa-head h1{font-size:24px}.qa-wrap{height:490px;min-height:0}.qa-controls{align-items:flex-end}.hyd-point-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style></head><body><div id="root"></div><script>${result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
  await writeFile(resolve(out, 'index.html'), html);
  return { html, bytes: Buffer.byteLength(html), file: resolve(out, 'index.html') };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await prepareMapPreview(); console.log(JSON.stringify({ file: result.file, bytes: result.bytes, status: 'PRÉVIA LOCAL GERADA · NÃO É ACEITE VISUAL' }));
}
