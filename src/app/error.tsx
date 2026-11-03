"use client";
import { TriangleAlert } from "lucide-react";
/** Estado de erro honesto: sem banco, nenhum indicador é mostrado (nada de números de demonstração no lugar). */
export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  return <main className="main" style={{ maxWidth: 640, paddingTop: 80 }}>
    <section className="panel" role="alert">
      <div className="kicker">RICHARDS INTELLIGENCE</div>
      <h1 style={{ fontSize: 24, margin: "12px 0 10px", display: "flex", gap: 10, alignItems: "center" }}><TriangleAlert size={22} color="#bd7d20" /> Dados indisponíveis no momento</h1>
      <p style={{ color: "#5d7278", fontSize: 13, lineHeight: 1.7, margin: 0 }}>
        Não foi possível consultar o banco de dados. Para não apresentar números falsos, os indicadores ficam ocultos até a conexão voltar.
        Confira o serviço em <code>/api/health</code>.
      </p>
      {error.digest && <p style={{ color: "#91a2a6", fontSize: 11, marginTop: 14 }}>Referência para o log do servidor: {error.digest}</p>}
      <button className="button dark" style={{ marginTop: 18 }} onClick={() => window.location.reload()}>Tentar novamente</button>
    </section>
  </main>;
}
