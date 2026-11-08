import { CircleSlash } from "lucide-react";

export default function NotFound() {
  return <main className="pp"><div className="pp-shell">
    <header className="pp-top"><div className="pp-brand"><span aria-hidden="true">R</span><div><b>RICHARDS</b><small>Passaporte do Alimento</small></div></div></header>
    <section className="pp-verdict stop" aria-labelledby="pp-title"><CircleSlash size={30} aria-hidden="true" />
      <div><h1 id="pp-title">Passaporte não encontrado</h1><p>Este QR não corresponde a nenhum lote registrado. Não use o alimento como liberado sem conferir com quem doou.</p></div>
    </section>
  </div></main>;
}
