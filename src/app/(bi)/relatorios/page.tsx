import type { Metadata } from "next";
import { Reports } from "@/components/bi/views/reports";
import { loadDashboard, type SearchParams } from "../load";
import { Unavailable } from "../unavailable";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Relatórios · RICHARDS Intelligence" };
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const loaded = await loadDashboard(searchParams);
  return loaded.ok ? <Reports initial={loaded.data} /> : <Unavailable loaded={loaded} />;
}
