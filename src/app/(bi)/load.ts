import { getDashboard } from "@/modules/analytics/application/get-dashboard";
import { OverviewNotSeededError } from "@/modules/analytics/application/get-overview";
import { FilterError, parseAnalyticsFilter } from "@/modules/analytics/domain/analytics-filter";
import type { DashboardDTO } from "@/modules/analytics/domain/dashboard";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export type Loaded = { ok: true; data: DashboardDTO } | { ok: false; reason: "filter" | "not-seeded"; message: string };

/** Filtro da URL → dashboard. Banco fora do ar NÃO é tratado aqui: sobe para o error.tsx (erro honesto, sem números). */
export async function loadDashboard(searchParams: SearchParams): Promise<Loaded> {
  try { return { ok: true, data: await getDashboard(parseAnalyticsFilter(await searchParams)) }; }
  catch (e) {
    if (e instanceof FilterError) return { ok: false, reason: "filter", message: e.message };
    if (e instanceof OverviewNotSeededError) return { ok: false, reason: "not-seeded", message: "Base não preparada: execute pnpm db:seed." };
    throw e;
  }
}
