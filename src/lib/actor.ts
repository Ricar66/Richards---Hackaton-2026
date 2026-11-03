/** Header definido SOMENTE pelo proxy (o valor enviado pelo cliente é descartado lá). */
export const ACTOR_HEADER = "x-richards-actor";
export function actorFrom(req: Request) {
  return req.headers.get(ACTOR_HEADER) ?? "desconhecido";
}
