import type { Metadata } from "next";
import { CircularWorkspace } from "@/components/circular/workspace";
import "@/components/circular/workspace.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "RICHARDS Circular · Rastreabilidade" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return <CircularWorkspace enabled={process.env.CIRCULAR_ENABLED === "true"} initialSource={params.source === "SIMULATED" ? "SIMULATED" : "MANUAL"} initialId={typeof params.lote === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(params.lote) ? params.lote : null} />;
}
