import { NextResponse } from "next/server";
import { getOverview } from "@/modules/analytics/application/get-overview";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(){try{return NextResponse.json(await getOverview(),{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({error:'Banco indisponível'},{status:503})}}
