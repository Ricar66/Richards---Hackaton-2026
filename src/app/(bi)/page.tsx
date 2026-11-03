import type { Metadata } from "next";
import { ControlCenter } from "@/components/bi/views/control-center";
import { loadDashboard, type SearchParams } from "./load";
import { Unavailable } from "./unavailable";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Centro de controle · RICHARDS Intelligence" };
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const loaded = await loadDashboard(searchParams);
  return loaded.ok ? <ControlCenter initial={loaded.data} /> : <Unavailable loaded={loaded} />;
}
