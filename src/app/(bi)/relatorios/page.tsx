import type { Metadata } from "next";
import { PageTransition } from "@/components/bi/page-transition";
import { Reports } from "@/components/bi/views/reports";
import { loadDashboard, type SearchParams } from "../load";
import { Unavailable } from "../unavailable";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Relatórios · RICHARDS Intelligence" };
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const loaded = await loadDashboard(searchParams);
  return <PageTransition>{loaded.ok ? <Reports initial={loaded.data} /> : <Unavailable loaded={loaded} />}</PageTransition>;
}
