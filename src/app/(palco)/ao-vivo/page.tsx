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
 * `?dispositivo=CODIGO` fixa o sensor da vazão. `?3d=1` liga e `?3d=0` desliga o gêmeo 3D (padrão: tentar com fallback;
 * a tecla 3 alterna na hora). `?atalhos=0` desliga os atalhos de uma tecla (F, P, 3, D).
 */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const raw = sp.dispositivo;
  const pinned = typeof raw === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(raw) ? raw : null;
  const initial3d = sp["3d"] === "1" ? true : sp["3d"] === "0" ? false : null;
  const shortcuts = sp.atalhos !== "0";
  let initial: StageSnapshot | null = null;
  let error: "not-seeded" | "database" | null = null;
  try { initial = await getStageSnapshot(); }
  catch (e) {
    error = e instanceof OverviewNotSeededError ? "not-seeded" : "database";
    if (error === "database") console.error("sala ao vivo", e);
  }
  return <LiveStage initial={initial} initialError={error} pinnedCode={pinned} initial3d={initial3d} shortcuts={shortcuts} />;
}
