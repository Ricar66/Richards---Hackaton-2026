import { getOverview } from "@/modules/analytics/application/get-overview";
import { IntelligenceV3Frame } from "@/components/intelligence-v3-frame";

export const dynamic = "force-dynamic";

/** BI experimental: layout V3 conectado em leitura à API do starter. */
export default async function IntelligencePage() {
  const data = await getOverview();
  return <IntelligenceV3Frame initialData={data} />;
}
