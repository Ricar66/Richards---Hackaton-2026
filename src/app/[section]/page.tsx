import { notFound } from "next/navigation";
import { getOverview } from "@/modules/analytics/application/get-overview";
import { WorkspaceV2 } from "@/components/workspace-v2";
export const dynamic="force-dynamic";
const sections=["monitoramento","ocorrencias","doacoes","relatorios","dispositivos"];
export default async function Section({params}:{params:Promise<{section:string}>}){
 const {section}=await params;if(!sections.includes(section))notFound();
 return <WorkspaceV2 initialData={await getOverview()} />;
}
