import { ViewTransition } from "react";

/** Só a SAÍDA da tela anterior desliza, na direção da barra lateral; sem tipo (revelação, filtro, evento) = nada. */
const EXIT = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" } as const;

/**
 * Transição das telas do BI (React 19.3 + View Transitions do navegador, sem dependência).
 * De propósito, é SÓ o deslize de saída ao trocar de tela pela barra lateral:
 * - durante uma view transition o navegador não entrega clique a quem participa dela. Uma revelação da página nova, um
 *   crossfade no filtro ou uma barra lateral "ancorada" com nome próprio engoliam o clique dado logo depois (o E2E pegou
 *   o filtro de 24 h sem efeito). Numa tela de operação, perder clique é pior que não ter animação;
 * - a página nova chega depois do esqueleto do `loading.tsx` (revelação de Suspense, sem tipo): entra sem animação;
 * - troca de filtro e evento ao vivo não animam: a tela atualiza no lugar (sem `key`: foco e estado preservados) e o
 *   número novo nunca "desliza".
 * Sem suporte no navegador, a troca é instantânea. Com "reduzir movimento", o CSS zera a duração.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return <ViewTransition exit={EXIT} default="none">{children}</ViewTransition>;
}
