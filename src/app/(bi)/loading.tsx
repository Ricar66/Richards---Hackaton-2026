/** Primeira carga de uma tela: esqueleto leve no lugar do conteúdo (troca de filtro mantém o quadro anterior esmaecido). */
export default function Loading() {
  return <div className="skeleton-page" role="status" aria-label="Carregando indicadores">
    <span className="sk title" /><span className="sk bar" />
    <div className="kpi-grid">{[0, 1, 2, 3].map(i => <span key={i} className="sk kpi-sk" />)}</div>
    <div className="grid-main"><span className="sk chart-sk" /><span className="sk chart-sk" /></div>
  </div>;
}
