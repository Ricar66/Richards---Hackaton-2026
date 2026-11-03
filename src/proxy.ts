import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ACTOR_HEADER } from '@/lib/actor';
import { apiError } from '@/lib/http';
// Compara digests de mesmo tamanho: não vaza o comprimento da credencial esperada.
const digest=(s:string)=>createHash('sha256').update(s).digest();
const equal=(a:string,b:string)=>timingSafeEqual(digest(a),digest(b));
/** Repassa a requisição descartando qualquer x-richards-actor vindo do cliente. */
function forward(req:NextRequest,actor:string|null){
 const headers=new Headers(req.headers);headers.delete(ACTOR_HEADER);
 if(actor)headers.set(ACTOR_HEADER,actor);
 return NextResponse.next({request:{headers}});
}
/**
 * CSRF: o navegador reenvia a Basic Auth guardada para qualquer site que poste aqui. Escritas na API exigem
 * JSON (formulário cross-site não consegue enviar sem preflight) e mesma origem quando o navegador informa.
 */
const UNSAFE=new Set(['POST','PUT','PATCH','DELETE']);
function rejectCrossSiteWrite(req:NextRequest){
 if(!UNSAFE.has(req.method)||!req.nextUrl.pathname.startsWith('/api/'))return null;
 const site=req.headers.get('sec-fetch-site');
 const origin=req.headers.get('origin');
 let foreignOrigin=false;
 if(origin){try{foreignOrigin=new URL(origin).host!==req.headers.get('host')}catch{foreignOrigin=true}}
 if((site&&site!=='same-origin')||foreignOrigin)return apiError(403,'CROSS_SITE_WRITE','Origem não permitida para escrita');
 if(!(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return apiError(415,'JSON_REQUIRED','Use Content-Type: application/json');
 return null;
}
export function proxy(req:NextRequest){
 const path=req.nextUrl.pathname;
 if(path.startsWith('/api/iot/telemetry')||path==='/api/health')return forward(req,null);
 const blocked=rejectCrossSiteWrite(req);if(blocked)return blocked;
 // Fail-closed: só AUTH_MODE="none" explícito desliga a senha (variável ausente ou com erro de digitação mantém a proteção).
 if(process.env.AUTH_MODE==='none') {
   // Sem proteção apenas para teste local; NUNCA exponha em rede pública.
   return forward(req,'acesso-local-sem-autenticacao');
 }
 const expectedUser=process.env.RICHARDS_OPERATOR_USER||'';
 const expectedPass=process.env.RICHARDS_OPERATOR_PASSWORD||'';
 if(!expectedUser||!expectedPass)return new NextResponse('Credenciais não configuradas',{status:503});
 let name='',password='';
 try{const h=req.headers.get('authorization')||'';const decoded=Buffer.from(h.replace(/^Basic /i,''),'base64').toString('utf8');[name,password]=[decoded.split(':')[0],decoded.slice(decoded.indexOf(':')+1)]}catch{}
 if(equal(name,expectedUser)&&equal(password,expectedPass))return forward(req,`operador:${expectedUser}`);
 return new NextResponse('Autenticação necessária',{status:401,headers:{'WWW-Authenticate':'Basic realm="RICHARDS Demonstracao"'}});
}
export const config={ matcher:['/((?!_next/static|_next/image|favicon.ico).*)'] };
