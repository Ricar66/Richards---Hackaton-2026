import { NextResponse } from "next/server";
import { getOverview, OverviewNotSeededError } from "@/modules/analytics/application/get-overview";
import { apiError, databaseUnavailable } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(){
  try{const {donations:_d,metrics,...data}=await getOverview();void _d;const {deliveredKg:_kg,...water}=metrics;void _kg;return NextResponse.json({...data,metrics:water},{headers:{'Cache-Control':'no-store'}})}
  catch(e){
    if(e instanceof OverviewNotSeededError)return apiError(503,'NOT_SEEDED','Base não preparada: execute pnpm db:seed.');
    console.error('analytics overview',e);return databaseUnavailable();
  }
}
