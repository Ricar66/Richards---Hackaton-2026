import type { Metadata } from "next";
import { Devices } from "@/components/bi/views/devices";
import { loadDashboard, type SearchParams } from "../load";
import { Unavailable } from "../unavailable";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dispositivos IoT · RICHARDS Intelligence" };
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const loaded = await loadDashboard(searchParams);
  return loaded.ok ? <Devices initial={loaded.data} /> : <Unavailable loaded={loaded} />;
}
