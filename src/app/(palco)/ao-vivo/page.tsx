import type { Metadata } from "next";
import { LiveStage } from "@/components/stage/live-stage";
import { getStageSnapshot, type StageSnapshot } from "@/modules/analytics/application/get-stage-snapshot";
import { OverviewNotSeededError } from "@/modules/analytics/application/get-overview";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sala ao vivo · RICHARDS Intelligence" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
/**
 * Tela de palco. O primeiro quadro já sai com o snapshot do servidor; banco fora não derruba a página:
 * a Sala abre dizendo que não há dado e continua tentando (nunca mostra número de enfeite).
 * `?dispositivo=CODIGO` fixa o sensor da vazão.
 */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams).dispositivo;
  const pinned = typeof raw === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(raw) ? raw : null;
  let initial: StageSnapshot | null = null;
  let error: "not-seeded" | "database" | null = null;
  try { initial = await getStageSnapshot(); }
  catch (e) {
    error = e instanceof OverviewNotSeededError ? "not-seeded" : "database";
    if (error === "database") console.error("sala ao vivo", e);
  }
  return <LiveStage initial={initial} initialError={error} pinnedCode={pinned} />;
}
