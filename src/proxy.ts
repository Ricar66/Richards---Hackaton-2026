import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
const equal=(a:string,b:string)=>{
 const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb);
};
export function proxy(req:NextRequest){
 const path=req.nextUrl.pathname;
 if(path.startsWith('/api/iot/telemetry')||path==='/api/health')return NextResponse.next();
 if(process.env.AUTH_MODE!=='basic') {
   // Sem proteção apenas para teste local; NUNCA exponha em rede pública.
   return NextResponse.next();
 }
 const expectedUser=process.env.RICHARDS_OPERATOR_USER||'';
 const expectedPass=process.env.RICHARDS_OPERATOR_PASSWORD||'';
 if(!expectedUser||!expectedPass)return new NextResponse('Credenciais não configuradas',{status:503});
 let name='',password='';
 try{const h=req.headers.get('authorization')||'';const decoded=Buffer.from(h.replace(/^Basic /i,''),'base64').toString('utf8');[name,password]=[decoded.split(':')[0],decoded.slice(decoded.indexOf(':')+1)]}catch{}
 if(equal(name,expectedUser)&&equal(password,expectedPass))return NextResponse.next();
 return new NextResponse('Autenticação necessária',{status:401,headers:{'WWW-Authenticate':'Basic realm="RICHARDS Demonstracao"'}});
}
export const config={ matcher:['/((?!_next/static|_next/image|favicon.ico).*)'] };
