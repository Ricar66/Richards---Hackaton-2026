import { clockBR, type AlarmMode, type RingView } from "./stage-logic";
import { BadgeSeal } from "./seal";

const STATE_CLASS: Record<RingView["state"], string> = {
  OBSERVANDO: "idle", CONTANDO: "counting", INTERROMPIDO: "broken", OCORRENCIA_ABERTA: "open", BLOQUEADO_REGRA_5: "blocked",
};

/**
 * Anel da regra de fluxo: um traço por segundo (até 60), aceso pelos segundos DECIDIDOS pela FlowAlertPolicy na última
 * leitura. Só a opacidade dos traços muda (nada de progresso animado entre leituras).
 * `alarm` (ISA-18.2): "pulse" enquanto a ocorrência do sensor está aberta e ninguém assumiu (pisca a no máximo 1 Hz),
 * "steady" depois de assumida. Forma (▲) e texto acompanham a cor; nunca se diz "vazamento".
 */
export function RuleRing({ view, deviceCode, alarm }: { view: RingView; deviceCode: string | null; alarm: AlarmMode }) {
  const n = Math.max(1, Math.min(60, view.limit));
  const lit = view.state === "OCORRENCIA_ABERTA" ? n : Math.floor(view.fraction * n + 1e-9);
  const cls = STATE_CLASS[view.state];
  return <section className={`inst rule-ring rr-${cls}`} data-alarm={alarm ?? undefined} aria-labelledby="stg-ring-title">
    <header className="inst-head">
      <h2 id="stg-ring-title">Regra · fluxo contínuo</h2>
      {deviceCode && <span className="inst-code">{deviceCode}</span>}
      {/* Ocorrência simulada ou de outra origem que a leitura: o anel diz de onde ela veio (regra 1). */}
      {view.occurrenceSeal && <BadgeSeal badge={view.occurrenceSeal} small />}
    </header>
    <div className="ring-body">
      <svg className="ring-svg" viewBox="0 0 200 200" aria-hidden="true">
        {Array.from({ length: n }, (_, i) => (
          <line key={i} x1="100" y1="10" x2="100" y2="26" transform={`rotate(${(i / n) * 360} 100 100)`} className={i < lit ? "tick on" : "tick"} />
        ))}
      </svg>
      <div className="ring-center">
        <b className="num">{view.observed}<small> s</small></b>
        <span>de {view.limit} s</span>
      </div>
    </div>
    <div className={`ring-state ${cls}`}>
      <strong>{view.label}</strong>
      <span>{view.detail}</span>
      {alarm && <em className="ring-ack">{alarm === "pulse" ? "▲ suspeita · ainda não assumida por um operador" : "assumida por um operador · alarme reconhecido"}</em>}
    </div>
    <p className="ring-rule">{view.rule}</p>
    {view.decidedAt !== null && <p className="ring-decided">decidido pela regra na leitura das <span className="mono">{clockBR(view.decidedAt)}</span></p>}
  </section>;
}
