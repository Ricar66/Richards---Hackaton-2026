"use client";
import { TriangleAlert } from "lucide-react";
/** Erro honesto fora do BI (ex.: BI V3 legado): sem banco, nenhum indicador é mostrado no lugar. */
export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  return <main className="page">
    <section className="panel notice" role="alert">
      <TriangleAlert size={20} />
      <div>
        <h1>Dados indisponíveis no momento</h1>
        <p>Não foi possível consultar o banco de dados. Para não apresentar números falsos, os indicadores ficam ocultos até a conexão voltar. Confira o serviço em <code>/api/health</code>.</p>
        {error.digest && <p className="muted-text small">Referência para o log do servidor: {error.digest}</p>}
        <button className="btn dark" onClick={() => window.location.reload()}>Tentar novamente</button>
      </div>
    </section>
  </main>;
}
