import type { LiveSource } from "@/modules/realtime/domain/live-event";
import { BadgeSeal, Seal } from "./seal";
import { fixedBR, kgBR, occurrenceSeal, secondsSince, sensorSeal, type ScaleLive, type ScaleView, type TemperatureLive, type TemperatureView } from "./stage-logic";
import { InstrumentTwin } from "./instrument-twin";
import { scaleInstrument, temperatureInstrument } from "./instrument-state";
import { ThermalGlyph } from "./thermal-glyph";

type Occ = { openedAt: string; title: string; source: LiveSource } | null;
const age = (at: number, now: number | null) => (now === null ? null : secondsSince(at, now));

/** Temperatura e umidade do canal ao vivo (DHT11). Ainda não é série gravada: a tela diz isso. */
type VisualOptions = { want3d?: boolean; reduced?: boolean; diag?: boolean };
export function TemperaturePanel({ t, view, occurrence, nowMs, want3d, reduced, diag }: { t: TemperatureLive | null; view: TemperatureView | null; occurrence: Occ; nowMs: number | null } & VisualOptions) {
  const seal = t ? sensorSeal("temperature", t.source, t.channel) : null;
  const ago = t ? age(t.at, nowMs) : null;
  // Ocorrência simulada ou de outra origem que a leitura em foco ganha o próprio selo (a regra 5 não olha a origem).
  const occSeal = occurrence ? occurrenceSeal(occurrence.source, t?.source ?? null) : null;
  const visual = temperatureInstrument(t, view);
  return <section className={`inst temp${view?.stale ? " stale" : ""}${occurrence ? " temp-has-alarm" : ""}`} aria-labelledby="stg-temp-title">
    <header className="inst-head">
      <h2 id="stg-temp-title">Temperatura</h2>
      {t && <span className="inst-code">{t.deviceCode}</span>}
      {seal && <Seal label={seal.label} simulated={seal.simulated} small />}
    </header>
    <div className="temp-layout">
      <InstrumentTwin kind="temperature" input={visual} enabled={want3d} reduced={reduced} diag={diag} label={`Instrumento térmico esquemático · ${visual.fresh ? "escala da leitura recebida" : "sem leitura recente"}${visual.simulated ? " · SIMULADO" : ""}`}>
        <ThermalGlyph fraction={visual.fraction} fresh={visual.fresh} simulated={visual.simulated} tone={visual.tone} />
      </InstrumentTwin>
      <div className="sensor-readout">
    {!t || !view ? <p className="waiting">aguardando leitura</p> : <>
      <div className="temp-values">
        <b className="num big2">{fixedBR(t.c, 1)}<small> °C</small></b>
        {t.humidityPct !== undefined && <span className="num hum">{fixedBR(t.humidityPct, 0)}<small> % UR</small></span>}
      </div>
      {view.stale && <p className="sensor-last-value">último valor · sem leitura recente</p>}
    </>}
      </div>
    </div>
    {t && view && <>
      <div className={`meter ${view.state}`} aria-hidden="true">
        <i className="meter-fill" style={{ transform: `scaleX(${view.fraction})` }} />
        <i className="meter-limit" style={{ left: `${view.limitFraction * 100}%` }} />
      </div>
      <p className={`temp-rule ${view.state}`}>{view.label}</p>
      {view.state !== "normal" && <div className="mini" aria-hidden="true"><i style={{ transform: `scaleX(${view.ruleFraction})` }} /></div>}
      {occurrence && <p className="occ-flag">{occSeal && <BadgeSeal badge={occSeal} small />}ocorrência de temperatura aberta · aguarda verificação</p>}
      {ago !== null && ago > 5 && <p className="age">última leitura há {ago} s</p>}
    </>}
    <p className="caption">DHT11 ±2 °C · ao vivo, fora do histórico</p>
  </section>;
}

// Frutas da caixa (posições do `crate3d` do conceito), na ordem em que aparecem conforme o peso.
const FRUITS: [number, number, number, "apple" | "lime" | "lemon"][] = [
  [203, 143, 31, "apple"], [270, 141, 26, "lime"], [328, 152, 25, "lemon"], [160, 115, 26, "apple"], [360, 125, 29, "lime"],
  [257, 112, 33, "lemon"], [209, 98, 28, "lime"], [312, 100, 32, "apple"], [405, 139, 28, "apple"],
];

/** Caixa isométrica (inspirada no `crate3d`): frutas visíveis proporcionais ao peso REAL. Representação esquemática. */
function Crate({ fill }: { fill: number }) {
  const shown = Math.round(fill * FRUITS.length);
  return <svg className="crate" viewBox="70 40 420 250" aria-hidden="true">
    <defs>
      <linearGradient id="stg-crate" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#c48b4d" /><stop offset=".5" stopColor="#5e3424" /><stop offset="1" stopColor="#e3a869" /></linearGradient>
      <radialGradient id="stg-apple" cx=".3" cy=".3"><stop stopColor="#ffb877" /><stop offset=".2" stopColor="#ef654d" /><stop offset="1" stopColor="#6e2b28" /></radialGradient>
      <radialGradient id="stg-lime" cx=".4" cy=".3"><stop stopColor="#e5fa91" /><stop offset=".4" stopColor="#76b958" /><stop offset="1" stopColor="#244b31" /></radialGradient>
      <radialGradient id="stg-lemon"><stop stopColor="#fff0a6" /><stop offset="1" stopColor="#bb9d33" /></radialGradient>
    </defs>
    <ellipse cx="272" cy="268" rx="185" ry="22" fill="#0007" />
    <path d="M100 130 270 72 464 140 287 204Z" fill="#a36a3b" stroke="#e2ad77" strokeWidth="6" />
    <g>{FRUITS.map(([x, y, r, c], i) => <g key={i} className={i < shown ? "fruit on" : "fruit"}>
      <circle cx={x} cy={y} r={r} fill={`url(#stg-${c})`} stroke="#fff4" strokeWidth="2" />
      <path d={`M${x} ${y - r + 4} q 2 -11 11 -13`} fill="none" stroke="#7fac58" strokeWidth="4" />
    </g>)}</g>
    <path d="M100 130 287 204 287 262 100 188Z" fill="url(#stg-crate)" stroke="#b37d4e" strokeWidth="5" />
    <path d="M287 204 464 140 464 196 287 262Z" fill="#603c29" stroke="#a67b4c" strokeWidth="5" />
    <path d="M110 166 285 230 M297 230 454 173" stroke="#312318" strokeWidth="10" opacity=".5" />
  </svg>;
}

/** Balança (HX711): peso ao vivo, segundos estáveis confirmados e a fase do detector, tudo decidido na ponte. */
export function ScalePanel({ s, view, nowMs, want3d, reduced, diag }: { s: ScaleLive | null; view: ScaleView | null; nowMs: number | null } & VisualOptions) {
  const seal = s ? sensorSeal("scale", s.source, s.channel) : null;
  const ago = s ? age(s.at, nowMs) : null;
  const visual = scaleInstrument(s, view);
  return <section className={`inst scale${view?.stale ? " stale" : ""}`} aria-labelledby="stg-scale-title">
    <header className="inst-head">
      <h2 id="stg-scale-title">Balança</h2>
      {s && <span className="inst-code">{s.deviceCode}</span>}
      {seal && <Seal label={seal.label} simulated={seal.simulated} small />}
    </header>
    <div className="scale-body">
      <InstrumentTwin kind="scale" input={visual} enabled={want3d} reduced={reduced} diag={diag} label={`Balança esquemática · carga ilustrativa, não contagem de itens · ${visual.fresh ? "proporcional à leitura recebida" : "sem leitura recente"}${visual.simulated ? " · SIMULADO" : ""}`}>
        <Crate fill={visual.fraction} />
      </InstrumentTwin>
      {!s || !view ? <p className="waiting">aguardando leitura</p> : <div className="scale-read">
        <b className="num big2">{fixedBR(s.kg, 2)}<small> kg</small></b>
        {view.stale && <p className="sensor-last-value">último valor · sem leitura recente</p>}
        <div className="segs" aria-label={`${view.lit} de ${view.total} segmentos de estabilidade`}>
          {Array.from({ length: view.total }, (_, i) => <i key={i} className={i < view.lit ? "on" : ""} />)}
        </div>
        <p className={`scale-phase ${view.phase}`}>{view.label}</p>
        <p className="scale-sub">{view.sub}</p>
        {ago !== null && ago > 5 && <p className="age">última leitura há {ago} s</p>}
      </div>}
    </div>
    <p className="sensor-illustration">carga ilustrativa · não identifica nem conta alimentos</p>
    <p className="caption">peso do lote = menor leitura estável, arredondada para baixo · {s ? `mínimo ${kgBR(s.progress.minKg)}` : "representação esquemática"}</p>
  </section>;
}
