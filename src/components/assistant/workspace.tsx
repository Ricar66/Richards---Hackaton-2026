"use client";
import { useEffect, useState, useRef } from "react";
import { Bot, Send, ShieldCheck, BellRing, ExternalLink, RefreshCw } from "lucide-react";
import { useNow } from "@/components/bi/hooks";
import { PageHeader } from "@/components/bi/primitives";
import type { AssistantAnswer, ChatMessage } from "@/modules/assistant/domain/contracts";
import "./workspace.css";
type Status={aiEnabled:boolean;telegramEnabled:boolean;model:string;dailyLimit:number;workerHeartbeat:string|null;pending:number;dead:number;subscriptions:{id:string;chatId:string;active:boolean;includeSimulated:boolean;dailySummary:boolean}[]};
type Message=ChatMessage&{result?:AssistantAnswer};
const SUGGESTIONS=["Quais ocorrências precisam de atenção?","Resuma as últimas 24 horas separando a origem dos dados.","Como investigar um alerta de fluxo?","Como vincular meu sensor a um ponto do mapa?"];
export function AssistantWorkspace(){
 const [status,setStatus]=useState<Status|null>(null),[statusError,setStatusError]=useState("");
 const [messages,setMessages]=useState<Message[]>([]),[question,setQuestion]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [link,setLink]=useState<{url:string;expiresAt:string}|null>(null),[linkBusy,setLinkBusy]=useState(false);
 const transcript=useRef<HTMLDivElement>(null);
 async function refresh(){try{const r=await fetch("/api/assistant/telegram",{cache:"no-store"});if(!r.ok)throw new Error("Configuração ainda indisponível. Verifique a migração e as variáveis com o responsável técnico.");setStatus(await r.json());setStatusError("");}catch(e){setStatusError(e instanceof Error?e.message:"Serviço indisponível.");}}
 useEffect(()=>{const timer=window.setTimeout(()=>void refresh(),0);return()=>window.clearTimeout(timer);},[]);
 const now=useNow();
 useEffect(()=>{transcript.current?.scrollTo({top:transcript.current.scrollHeight,behavior:"instant"});},[messages,busy]);
 async function send(e:React.FormEvent){e.preventDefault();const text=question.trim();if(!text||busy)return;const history=messages.slice(-6).map(({role,content})=>({role,content:content.slice(0,2000)}));setQuestion("");setError("");setMessages(m=>[...m,{role:"user",content:text}]);setBusy(true);
  try{const r=await fetch("/api/assistant/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text,history})});const b=await r.json();if(!r.ok)throw new Error(b.error||"Não foi possível consultar o assistente.");setMessages(m=>[...m,{role:"assistant",content:b.answer,result:b}]);}catch(e){setError(e instanceof Error?e.message:"Conexão indisponível.");}finally{setBusy(false);}
 }
 async function telegram(action:Record<string,unknown>){setLinkBusy(true);setError("");try{const r=await fetch("/api/assistant/telegram",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(action)});const b=await r.json();if(!r.ok)throw new Error(b.error||"Operação indisponível.");if(b.url)setLink(b);await refresh();}catch(e){setError(e instanceof Error?e.message:"Conexão indisponível.");}finally{setLinkBusy(false);}}
 const workerRecent=!!status?.workerHeartbeat&&now!==null&&now-Date.parse(status.workerHeartbeat)<30000;
 return <div className="assist-workspace">
  <PageHeader kicker="Inteligência a serviço da operação" title="RICHARDS Assist" actions={<button className="btn" onClick={()=>void refresh()}><RefreshCw size={15}/> Atualizar status</button>}>Converse sobre os dados, entenda os alertas e receba avisos no Telegram. As decisões e verificações continuam com a equipe.</PageHeader>
  <div className="assist-layout">
   <section className="assist-chat" aria-labelledby="assist-title">
    <header><div className="assist-mark"><Bot size={25}/></div><div><h2 id="assist-title">Como posso ajudar na operação?</h2><p>Consultas com fontes do RICHARDS · acesso somente de leitura</p></div><span className="assist-state">{status?.aiEnabled?"IA configurada":"Aguardando ativação"}</span></header>
    <div className="assist-transcript" ref={transcript} role="log" aria-label="Conversa com o assistente" aria-live="polite">
     {!messages.length&&<div className="assist-welcome"><h3>Entenda o que merece atenção.</h3><p>Posso consultar indicadores, listar ocorrências e explicar a evidência ou o funcionamento do produto. Cada resposta usa consultas ao sistema.</p><div className="assist-suggestions">{SUGGESTIONS.map(s=><button key={s} onClick={()=>setQuestion(s)}>{s}</button>)}</div></div>}
     {messages.map((m,i)=><article key={i} className={`assist-message ${m.role}`}><small>{m.role==="user"?"Você":"RICHARDS Assist"}</small><p>{m.content}</p>{m.result&&m.result.sources.length>0&&<div className="assist-sources"><span>Fontes consultadas:</span>{m.result.sources.map(s=><a key={s.href} href={s.href}>{s.label} <ExternalLink size={11}/></a>)}<small>Consulta em {new Date(m.result.generatedAt).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})}</small></div>}</article>)}
     {busy&&<p className="assist-working" role="status">Consultando registros e preparando a resposta…</p>}
    </div>
    <form className="assist-composer" onSubmit={send}><label className="sr-only" htmlFor="assist-question">Sua pergunta</label><textarea id="assist-question" value={question} onChange={e=>setQuestion(e.target.value)} maxLength={2000} rows={2} placeholder="Pergunte sobre uma ocorrência, um indicador ou como usar o RICHARDS…"/><button className="btn primary" type="submit" disabled={busy||!question.trim()||!status?.aiEnabled}><Send size={16}/> Enviar</button></form>
    <p className="assist-disclosure"><ShieldCheck size={14}/> A IA pode errar. Confira as fontes antes de agir. Credenciais e dados pessoais não devem ser enviados na conversa.</p>
   </section>
   <aside className="assist-side"><section className="panel"><header className="panel-head"><div><span className="eyebrow">Operação acompanhada</span><h2><BellRing size={17}/> Alertas no Telegram</h2></div></header><div className="assist-side-content"><p>Receba ocorrências, lembretes de investigação e avisos de falta de comunicação mesmo com o painel fechado.</p><dl><div><dt>Monitor</dt><dd>{workerRecent?"Contato recente do worker":"Sem contato recente"}</dd></div><div><dt>Fila pendente</dt><dd>{status?.pending??"—"}</dd></div><div><dt>Envios sem sucesso</dt><dd>{status?.dead??"—"}</dd></div></dl><button className="btn primary" disabled={linkBusy||!status?.telegramEnabled} onClick={()=>void telegram({action:"link"})}>Conectar meu Telegram</button>{link&&<div className="assist-link"><a className="btn" href={link.url} target="_blank" rel="noopener noreferrer">Abrir Telegram <ExternalLink size={13}/></a><small>Toque em Iniciar. Link de uso único, válido até {new Date(link.expiresAt).toLocaleTimeString("pt-BR")}.</small><button className="link" onClick={()=>void refresh()}>Já iniciei, conferir vínculo</button></div>}
    {status?.subscriptions.map(s=><div className="assist-sub" key={s.id}><b>Chat {s.chatId} · {s.active?"ativo":"desativado"}</b><label><input type="checkbox" disabled={linkBusy} checked={s.includeSimulated} onChange={e=>void telegram({action:"preferences",id:s.id,includeSimulated:e.target.checked,dailySummary:s.dailySummary})}/> Incluir demonstrações SIMULATED</label><label><input type="checkbox" disabled={linkBusy} checked={s.dailySummary} onChange={e=>void telegram({action:"preferences",id:s.id,includeSimulated:s.includeSimulated,dailySummary:e.target.checked})}/> Receber resumo diário</label><button className="btn" disabled={linkBusy||!s.active} onClick={()=>void telegram({action:"disconnect",id:s.id})}>Desconectar</button></div>)}
    <p className="assist-small">O contato recente mostra que o worker está consultando o banco; não garante entrega no celular. A fila registra tentativas e falhas. Resumos usam as últimas 24 h e as origens escolhidas.</p></div></section>
    <section className="panel"><header className="panel-head"><h2>O que continua sob seu controle</h2></header><div className="assist-side-content"><p>O assistente explica e consulta. Investigações, verificações sanitárias e confirmação de recebimento continuam no BI.</p><p>Os alertas usam regras e registros, sem depender da IA. Simulação permanece identificada.</p><button className="link" onClick={()=>{setMessages([]);setError("");}}>Limpar conversa neste navegador</button></div></section>
   </aside>
  </div>
  {(error||statusError)&&<p className="stale-banner" role="alert">{error||statusError}</p>}
 </div>;
}
