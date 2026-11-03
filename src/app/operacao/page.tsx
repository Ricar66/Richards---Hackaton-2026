import { getOverview } from "@/modules/analytics/application/get-overview";
import { WorkspaceV2 } from "@/components/workspace-v2";
export const dynamic = "force-dynamic";
export default async function OperacaoPage(){ return <WorkspaceV2 initialData={await getOverview()} />; }
