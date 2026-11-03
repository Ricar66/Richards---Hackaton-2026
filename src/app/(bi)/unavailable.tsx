import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import type { Loaded } from "./load";

export function Unavailable({ loaded }: { loaded: Extract<Loaded, { ok: false }> }) {
  return <section className="panel notice" role="alert">
    <TriangleAlert size={20} />
    <div>
      <h1>{loaded.reason === "filter" ? "Filtro inválido" : "Base de dados não preparada"}</h1>
      <p>{loaded.message}</p>
      {loaded.reason === "filter" && <Link className="btn" href="?">Limpar filtros</Link>}
    </div>
  </section>;
}
