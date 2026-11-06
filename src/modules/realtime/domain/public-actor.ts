/**
 * Autor de uma ação como pode aparecer no telão e no stream ao vivo.
 * O usuário do operador (`operador:<usuário>`) é metade da credencial Basic de laboratório: nunca sai do servidor.
 * O `--preparar` da bancada grava `preparacao:<usuário do Windows>`: no telão vira só "preparação do palco".
 * O banco e a auditoria continuam com o autor completo.
 *
 * A máscara vale por PREFIXO de segmento (tudo depois de `operador:` sai, inclusive usuário com espaço) e também
 * dentro de autores compostos: `simulador:operador:<usuário>` vira `simulador:operador`.
 */
const LOCAL = "acesso-local-sem-autenticacao";
const MASKS: readonly (readonly [prefix: string, label: string])[] = [["operador:", "operador"], ["preparacao:", "preparação do palco"]];

export function publicActor(actor: string | null | undefined): string {
  if (!actor) return "—";
  // Percorre os segmentos separados por ":"; o primeiro que for de operador ou preparação corta o resto.
  for (let p = 0; ;) {
    const rest = actor.slice(p);
    if (rest === LOCAL) return `${actor.slice(0, p)}operador local`;
    for (const [prefix, label] of MASKS) if (rest.startsWith(prefix)) return `${actor.slice(0, p)}${label}`;
    const next = actor.indexOf(":", p);
    if (next < 0) return actor;
    p = next + 1;
  }
}
