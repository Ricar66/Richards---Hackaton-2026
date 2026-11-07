import type { Metadata } from "next";
import { PageTransition } from "@/components/bi/page-transition";
import { Donations } from "@/components/bi/views/donations";
import { loadDashboard, type SearchParams } from "../load";
import { Unavailable } from "../unavailable";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Doações & impacto · RICHARDS Intelligence" };
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const loaded = await loadDashboard(searchParams);
  return <PageTransition>{loaded.ok ? <Donations initial={loaded.data} /> : <Unavailable loaded={loaded} />}</PageTransition>;
}
