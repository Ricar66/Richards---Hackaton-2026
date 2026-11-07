/** Estado do robô do RICHARDS Assist no BI (sem React: testável no `pnpm test`). */
export const ROBOT_KEY = "richards.robo";
export type RobotMode = "andando" | "parado" | "oculto";

/** Valor gravado no navegador → escolha. Qualquer valor desconhecido volta ao padrão (andando). */
export function parseRobotMode(raw: string | null | undefined): RobotMode {
  return raw === "parado" || raw === "oculto" ? raw : "andando";
}

/**
 * O que a tela mostra. "Reduzir movimento" do sistema deixa o robô parado mesmo que a escolha seja andar;
 * na própria tela do assistente ele não aparece (a conversa já está aberta).
 */
export function robotView(mode: RobotMode, reducedMotion: boolean, pathname: string): "andando" | "parado" | null {
  if (mode === "oculto" || pathname === "/assistente" || pathname.startsWith("/assistente/")) return null;
  return reducedMotion ? "parado" : mode;
}

/** Fala do balão. A contagem vem do servidor (o mesmo número do sino); sem ela, só a saudação. */
export function robotGreeting(activeCount: number | null | undefined): string {
  const n = typeof activeCount === "number" && Number.isFinite(activeCount) && activeCount > 0 ? Math.floor(activeCount) : 0;
  if (!n) return "Oi! Sou o RICHARDS Assist. Posso ajudar?";
  return n === 1 ? "Há 1 ocorrência ativa. Quer ajuda para entender?" : `Há ${n} ocorrências ativas. Quer ajuda para entender?`;
}
