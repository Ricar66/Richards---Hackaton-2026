import type { CSSProperties } from "react";
import { AlertTriangle, Ban, CheckCircle2, Clock3, HandHeart, PackageCheck, Scale, ShieldCheck, Snowflake } from "lucide-react";
import type { PublicPassport } from "@/modules/donations/application/passport-service";
import { coldHeadline, type StampKey, type VerdictTone } from "@/modules/donations/domain/passport";
import { dateBR, dayBR, hourBR, numBR } from "@/lib/format";
import { sparkline } from "./spark";

const STAMP_ICON: Record<StampKey, typeof Scale> = { WEIGHED: Scale, TRIAGED: ShieldCheck, RESERVED: HandHeart, DELIVERED: PackageCheck };
const VERDICT_ICON: Record<VerdictTone, typeof Scale> = { wait: Clock3, ok: ShieldCheck, done: CheckCircle2, stop: Ban };
/** Carimbo de verdade nunca sai reto: cada um com uma inclinação própria (fixa, para servidor e navegador iguais). */
const TILT = [-3.5, 2.5, -1.5, 3];
const when = (iso: string) => `${dayBR(iso)} · ${hourBR(iso)}`;
const deg = (n: number) => `${numBR(n, 1)} °C`.replace("-", "−");
const coverage = (n: number) => (n > 0 && n < 0.1 ? "< 0,1" : numBR(n, n < 10 ? 1 : 0));
const W = 320, H = 96;

function Cold({ p }: { p: PublicPassport }) {
  if (!p.triage) return <section className="pp-card pp-quiet" aria-labelledby="pp-cold">
    <h2 id="pp-cold">Temperatura de conservação</h2>
    <p>{p.status === "CANCELLED" ? "O lote foi retirado antes da triagem." : "A temperatura do equipamento de origem é anexada na triagem, quando a pessoa responsável declara de onde saiu o alimento."}</p>
  </section>;
  if (!p.cold) return <section className="pp-card pp-quiet" aria-labelledby="pp-cold">
    <h2 id="pp-cold">Temperatura de conservação</h2>
    <p>{p.originDeclared
      ? "O alimento não estava em equipamento monitorado. A conservação foi declarada pela pessoa responsável, sem série de temperatura."
      : "O equipamento de origem não foi informado na triagem."}</p>
  </section>;
  const c = p.cold, s = c.summary;
  const sp = sparkline(c.series, c.equipment.range, W, H, 6, [Date.parse(c.from), Date.parse(c.to)]);
  const head = coldHeadline(s.inRangePct, s.coveragePct, s.excursionCount);
  const end = c.open ? "agora" : p.status === "CANCELLED" ? "o cancelamento" : "a entrega";
  const label = s.inRangePct === null ? "Sem leitura gravada na janela."
    : `Temperatura de ${c.equipment.label}: ${numBR(s.inRangePct, 1)}% do tempo medido na faixa, ${s.excursionCount} excursões, mínima ${s.minC === null ? "sem dado" : deg(s.minC)} e máxima ${s.maxC === null ? "sem dado" : deg(s.maxC)}.`;
  const maxY = c.equipment.range.maxC !== null ? sp?.band.top : null, minY = c.equipment.range.minC !== null ? sp?.band.bottom : null;
  return <section className="pp-card pp-cold" aria-labelledby="pp-cold">
    <div className="pp-sec-head">
      <h2 id="pp-cold">Temperatura do equipamento de origem</h2>
      {c.source === "SIMULATED" && <span className="pp-tag sim">SIMULADO</span>}
    </div>
    <p className="pp-equip"><Snowflake size={16} aria-hidden="true" /><span><b>{c.equipment.label}</b> · {c.equipment.kindLabel} · {c.equipment.siteName}</span></p>
    <div className={`pp-pct ${head.tone}`}>
      <b className="pp-num">{s.inRangePct === null ? "sem dado" : `${numBR(s.inRangePct, 1)}%`}</b>
      <span>{s.inRangePct === null ? "Nenhuma leitura gravada nesta janela: não há como afirmar que ficou na faixa." : <>do tempo medido na faixa <strong>{c.equipment.rangeText}</strong></>}</span>
      {head.note && <span className="pp-partial">{head.note}</span>}
    </div>
    {sp && <figure className="pp-fig">
      <svg viewBox={`0 0 ${W} ${H}`} className="pp-spark" role="img" aria-label={label}>
        <rect className="pp-band" x="0" y={sp.band.top} width={W} height={Math.max(0, sp.band.bottom - sp.band.top)} />
        {maxY != null && <line className="pp-limit" x1="0" x2={W} y1={maxY} y2={maxY} />}
        {minY != null && <line className="pp-limit" x1="0" x2={W} y1={minY} y2={minY} />}
        <path className="pp-line" d={sp.line} vectorEffect="non-scaling-stroke" />
        {sp.out.map((o, i) => <circle key={i} className="pp-out" cx={o.x} cy={o.y} r="2.4" />)}
      </svg>
      <figcaption className="pp-axis"><span>{when(c.from)}</span><span>{c.open ? "agora" : when(c.to)}</span></figcaption>
    </figure>}
    <dl className="pp-stats">
      <div><dt>Cobertura</dt><dd className="pp-num">{coverage(s.coveragePct)}%</dd></div>
      <div><dt>Excursões</dt><dd className={`pp-num ${s.excursionCount ? "warn" : ""}`}>{s.excursionCount}</dd></div>
      <div><dt>Mín · máx °C</dt><dd className="pp-num">{s.minC === null || s.maxC === null ? "—" : `${numBR(s.minC, 1)} · ${numBR(s.maxC, 1)}`.replaceAll("-", "−")}</dd></div>
    </dl>
    {s.longest && <p className="pp-exc"><AlertTriangle size={15} aria-hidden="true" /><span>
      Maior excursão: <b>{numBR(s.longest.minutes, 0)} min</b>, pico <b>{deg(s.longest.peakC)}</b>, em {when(s.longest.start)}{s.longest.ongoing ? ", ainda fora da faixa no fim da janela" : ""}.
    </span></p>}
    <p className="pp-note">
      Registro do equipamento de 24 h antes da pesagem até {end}{c.capped ? " (limitado aos 7 primeiros dias)" : ""}. É a temperatura do equipamento, não do
      alimento, e o transporte não tem sensor. Tempo sem leitura não conta como na faixa. Faixa: {c.equipment.reference}.
    </p>
  </section>;
}

function Triage({ p }: { p: PublicPassport }) {
  const t = p.triage;
  return <section className="pp-card" aria-labelledby="pp-triage">
    <h2 id="pp-triage">Triagem sanitária</h2>
    {!t ? <p className="pp-muted">{p.status === "CANCELLED" ? "Não realizada: o lote foi retirado antes." : "Ainda não registrada. Até a triagem, este lote não está liberado para doação."}</p> : <>
      <p className="pp-by"><ShieldCheck size={18} aria-hidden="true" /><span>
        Registrada por <b>{t.by ?? "pessoa responsável"}</b>{t.qualification ? <> · <b>{t.qualification}</b></> : null}<small>{dateBR(t.at)}</small>
      </span></p>
      {t.checklist.length > 0 && <ul className="pp-checks" aria-label="Declarado na triagem">
        {t.checklist.map(c => <li key={c}><CheckCircle2 size={15} aria-hidden="true" />{c}</li>)}
      </ul>}
    </>}
    <p className="pp-law">
      Lei 15.224/2025, art. 14, §1º: quem doa direto ao beneficiário e as instituições receptoras devem contar com
      “profissional legalmente habilitado que ateste a qualidade nutricional e sanitária” dos alimentos.
    </p>
  </section>;
}

/** Página pública do lote (QR da etiqueta). Renderizada no servidor; nenhum dado sai além do recorte de `PublicPassport`. */
export function PassportView({ p }: { p: PublicPassport }) {
  const Verdict = VERDICT_ICON[p.verdict.tone];
  const created = p.stamps[0].at!;
  const delivered = p.stamps[3].at;
  return <main className="pp">
    <div className="pp-shell">
      <header className="pp-top">
        <div className="pp-brand"><span aria-hidden="true">R</span><div><b>RICHARDS</b><small>Passaporte do Alimento</small></div></div>
        <div className="pp-code"><small>Lote</small><b>{p.code}</b></div>
      </header>

      {p.source === "SIMULATED" && <p className="pp-sim" role="note"><b>SIMULADO</b><span>Lote e medições da bancada virtual de demonstração. Não representam alimento real.</span></p>}

      <section className={`pp-verdict ${p.verdict.tone}`} aria-labelledby="pp-title">
        <Verdict size={30} aria-hidden="true" />
        <div><h1 id="pp-title">{p.verdict.title}</h1><p>{p.verdict.text}</p></div>
      </section>

      <section className="pp-card pp-hero" aria-label="O lote">
        <div className="pp-kg"><b className="pp-num">{numBR(p.kg, 2)}</b><span>kg</span></div>
        <p className="pp-desc">{p.description}</p>
        <dl className="pp-facts">
          <div><dt>Doado por</dt><dd>{p.store.name}{p.store.demo && <em>demonstração</em>}</dd></div>
          {p.triage?.foodOrigin && <div><dt>Tipo de alimento</dt><dd>{p.triage.foodOrigin}</dd></div>}
          <div><dt>{p.weighedByScale ? "Pesado na balança" : "Registrado"}</dt><dd>{dateBR(created)}</dd></div>
        </dl>
      </section>

      <section className="pp-card pp-journey" aria-labelledby="pp-journey">
        <h2 id="pp-journey">Jornada do lote</h2>
        <ol className={`pp-stamps ${p.cancelledAt ? "voided" : ""}`}>
          {p.stamps.map((s, i) => {
            const Icon = STAMP_ICON[s.key];
            return <li key={s.key} className={s.at ? "on" : "off"} style={{ "--i": i, "--r": `${TILT[i]}deg` } as CSSProperties}>
              <Icon size={18} aria-hidden="true" />
              <b>{s.label}</b>
              <span className="pp-num">{s.at ? when(s.at) : "pendente"}</span>
            </li>;
          })}
        </ol>
        {p.cancelledAt && <div className="pp-void" role="note"><b>Retirado da doação</b><span className="pp-num">{when(p.cancelledAt)}</span></div>}
      </section>

      <Cold p={p} />
      <Triage p={p} />

      {p.recipient && <section className="pp-card pp-dest" aria-labelledby="pp-dest">
        <h2 id="pp-dest">Destino</h2>
        <p className="pp-by"><HandHeart size={18} aria-hidden="true" /><span><b>{p.recipient.name}</b> · {p.recipient.city}</span></p>
        <p className="pp-muted">{p.status === "DELIVERED" && delivered ? `Recebimento confirmado pela instituição em ${dateBR(delivered)}.` : "Reservado. A entrega ainda não foi confirmada."}</p>
      </section>}

      <footer className="pp-foot">
        <p>O RICHARDS registra medições e as declarações das pessoas responsáveis. Ele não certifica o alimento: a responsabilidade sanitária é de quem atesta.</p>
        <p>Consultado em {dateBR(p.generatedAt)}, horário de Brasília.</p>
      </footer>
    </div>
  </main>;
}

/** Banco fora: a página diz isso, sem inventar estado do lote. */
export function PassportUnavailable() {
  return <main className="pp"><div className="pp-shell">
    <header className="pp-top"><div className="pp-brand"><span aria-hidden="true">R</span><div><b>RICHARDS</b><small>Passaporte do Alimento</small></div></div></header>
    <section className="pp-verdict wait" aria-labelledby="pp-title"><Clock3 size={30} aria-hidden="true" />
      <div><h1 id="pp-title">Passaporte indisponível agora</h1><p>Não foi possível consultar o registro deste lote. Tente de novo em instantes. Sem consulta, não use o lote como liberado.</p></div>
    </section>
  </div></main>;
}
