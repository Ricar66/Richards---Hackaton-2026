import { clockBR, secondsSince, type FeedLine, type FeedTone } from "./stage-logic";

const GLYPH: Record<FeedTone, string> = { danger: "▲", warn: "◔", ok: "✓", info: "◆", muted: "○" };
const SOURCE: Record<string, [string, string]> = { DEVICE: ["SENSOR", "real"], SIMULATED: ["SIMULADO", "sim"], MANUAL: ["MANUAL", "neutral"] };

/**
 * Feed da sessão, mais novo no topo. Leitura não vira linha: fica o pulso ("N leituras nesta sessão · última há X s").
 * Ganham linha só fatos: regra contou/zerou, ocorrência e lote mudaram, mensagem descartada, dispositivo calado.
 */
export function EventFeed({ lines, readingCount, lastReadingAt, nowMs, pulse }: { lines: FeedLine[]; readingCount: number; lastReadingAt: number | null; nowMs: number | null; pulse: number }) {
  const last = lastReadingAt !== null && nowMs !== null ? secondsSince(lastReadingAt, nowMs) : null;
  return <section className="inst feed" aria-labelledby="stg-feed-title">
    <header className="inst-head"><h2 id="stg-feed-title">Eventos</h2></header>
    <p className="feed-pulse">
      <i key={pulse} className={pulse ? "beat" : ""} aria-hidden="true" />
      <span className="num">{readingCount}</span> {readingCount === 1 ? "leitura" : "leituras"} nesta sessão
      {last !== null ? <> · última há <span className="num">{last}</span> s</> : " · aguardando a primeira"}
    </p>
    <ol className="feed-list">
      {lines.map(l => {
        const src = l.source ? SOURCE[l.source] : null;
        return <li key={l.key} className={`feed-line ${l.tone}`}>
          <time className="mono">{clockBR(l.at)}</time>
          <span className="glyph" aria-hidden="true">{GLYPH[l.tone]}</span>
          <div><strong>{l.title}</strong><span>{l.detail}</span></div>
          {src && <span className={`seal small ${src[1]}`}>{src[0]}</span>}
        </li>;
      })}
      {!lines.length && <li className="feed-empty">Nenhum evento registrado ainda.</li>}
    </ol>
  </section>;
}
