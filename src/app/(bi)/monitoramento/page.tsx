import type { Metadata } from "next";
import { PageTransition } from "@/components/bi/page-transition";
import { Monitoring } from "@/components/bi/views/monitoring";
import { loadDashboard, type SearchParams } from "../load";
import { Unavailable } from "../unavailable";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Monitoramento hídrico · RICHARDS Intelligence" };
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const loaded = await loadDashboard(searchParams);
  return <PageTransition>{loaded.ok ? <Monitoring initial={loaded.data} /> : <Unavailable loaded={loaded} />}</PageTransition>;
}
