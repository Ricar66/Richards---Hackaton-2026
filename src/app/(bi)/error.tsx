"use client";
import { TriangleAlert } from "lucide-react";
/** Erro honesto dentro do shell: sem banco, nenhum indicador aparece (nada de números de demonstração no lugar). */
export default function BiError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="panel notice" role="alert">
    <TriangleAlert size={20} />
    <div>
      <h1>Dados indisponíveis no momento</h1>
      <p>Não foi possível consultar o banco de dados. Para não apresentar números falsos, os indicadores ficam ocultos até a conexão voltar. Confira o serviço em <code>/api/health</code>.</p>
      {error.digest && <p className="muted-text small">Referência para o log do servidor: {error.digest}</p>}
      <button className="btn dark" onClick={() => reset()}>Tentar novamente</button>
    </div>
  </section>;
}
