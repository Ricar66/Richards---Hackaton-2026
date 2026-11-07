import type { DashboardDTO } from "./dashboard";
import type { StageSnapshot } from "../application/get-stage-snapshot";
/** Tipos históricos são mantidos internamente; campos retirados não são publicados pela API atual. */
export function waterDashboard(d:DashboardDTO){const{donations:_d,kpis,...base}=d;void _d;const{deliveredKg:_kg,deliveredCount:_c,availableKg:_a,pendingReview:_r,...water}=kpis;void _kg;void _c;void _a;void _r;return{...base,kpis:water};}
export function waterStage(s:StageSnapshot){const{pendingScaleLots:_l,today,...base}=s;void _l;const{deliveredKg:_kg,deliveredBatches:_b,pendingReview:_r,...water}=today;void _kg;void _b;void _r;return{...base,today:water,audit:s.audit.map(({kg:_kg,institution:_i,...a})=>{void _kg;void _i;return a;})};}
