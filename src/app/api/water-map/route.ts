import { NextRequest,NextResponse } from "next/server";
import { actorFrom } from "@/lib/actor";
import { WaterMapService,WaterMapError } from "@/modules/water-map/application/water-map-service";
export const runtime="nodejs";export const dynamic="force-dynamic";
function failure(e:unknown){return NextResponse.json({error:e instanceof WaterMapError?e.message:"Mapa indisponível. Confira conexão e migração; nenhuma leitura foi inventada."},{status:e instanceof WaterMapError?e.status:503,headers:{"Cache-Control":"no-store"}});}
export async function GET(req:NextRequest){try{const source=req.nextUrl.searchParams.get("source")??"DEVICE";if(source!=="DEVICE"&&source!=="SIMULATED")throw new WaterMapError("Origem inválida",422);return NextResponse.json(await new WaterMapService().read(req.nextUrl.searchParams.get("siteId"),source),{headers:{"Cache-Control":"no-store"}});}catch(e){return failure(e);}}
export async function PUT(req:Request){try{
 const actor=actorFrom(req);if(!actor.startsWith("operador:"))throw new WaterMapError("Operador autenticado obrigatório",403);
 const reader=req.body?.getReader();if(!reader)throw new WaterMapError("JSON obrigatório",400);let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>32000){await reader.cancel();throw new WaterMapError("Planta excede 32 kB",413);}chunks.push(r.value);}}finally{reader.releaseLock();}
 let raw:unknown;try{raw=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new WaterMapError("JSON inválido",400);}
 return NextResponse.json(await new WaterMapService().save(raw,actor),{headers:{"Cache-Control":"no-store"}});
}catch(e){return failure(e);}}
