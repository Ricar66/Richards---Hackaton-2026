import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function GET() { return NextResponse.json({ service: "richards", healthy: true, at: new Date().toISOString() }); }
