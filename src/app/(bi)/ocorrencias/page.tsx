import type { Metadata } from "next";
import { Occurrences } from "@/components/bi/views/occurrences";
import { loadDashboard, type SearchParams } from "../load";
import { Unavailable } from "../unavailable";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ocorrências · RICHARDS Intelligence" };
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const loaded = await loadDashboard(searchParams);
  return loaded.ok ? <Occurrences initial={loaded.data} /> : <Unavailable loaded={loaded} />;
}
