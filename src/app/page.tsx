import { getOverview } from "@/modules/analytics/application/get-overview";
import { IntelligenceV3Frame } from "@/components/intelligence-v3-frame";
export const dynamic = "force-dynamic";
export default async function Home(){ return <IntelligenceV3Frame initialData={await getOverview()} />; }
