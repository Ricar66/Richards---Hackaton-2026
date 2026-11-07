import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, type RGB } from "pdf-lib";
import type { DashboardDTO } from "@/modules/analytics/domain/dashboard";
import { reportFigures } from "@/modules/analytics/domain/report-figures";
import { TIME_ZONE, bucketLabel, dateBR, durationBR, numBR } from "@/lib/format";

/** Versão do layout do relatório (muda quando o conteúdo/forma muda; aparece no rodapé). */
export const REPORT_VERSION = "RICHARDS-AGUA-R3";
const W = 595.28, H = 841.89, M = 40;
const C = { ink: rgb(0.075, 0.137, 0.165), muted: rgb(0.384, 0.459, 0.475), faint: rgb(0.56, 0.63, 0.645), line: rgb(0.886, 0.914, 0.906), soft: rgb(0.953, 0.965, 0.961), band: rgb(0.059, 0.129, 0.157), accent: rgb(0.075, 0.494, 0.467), accentSoft: rgb(0.78, 0.9, 0.88), warn: rgb(0.81, 0.478, 0.071), danger: rgb(0.78, 0.286, 0.267), sim: rgb(0.353, 0.247, 0.608), white: rgb(1, 1, 1) };
const STATUS: Record<string, string> = { OPEN: "Aberta", ACKNOWLEDGED: "Em análise", RESOLVED: "Resolvida", DISMISSED: "Descartada" };
const SEVERITY: Record<string, string> = { CRITICAL: "Crítica", HIGH: "Alta", MEDIUM: "Média", LOW: "Baixa" };
const SOURCE: Record<string, string> = { DEVICE: "Sensor", SIMULATED: "Simulado", MANUAL: "Manual" };
const CONNECTIVITY: Record<string, string> = { ONLINE: "Comunicando", OFFLINE: "Sem comunicação", NEVER_SEEN: "Nunca comunicou", MAINTENANCE: "Manutenção" };
const STAMP: Record<DashboardDTO["provenance"]["label"], [string, RGB]> = {
  SIMULATED: ["DADOS DE DEMONSTRAÇÃO (SIMULADOS)", C.sim], MIXED: ["DADOS MISTOS: SENSOR + SIMULADOS", C.sim],
  DEVICE: ["LEITURAS DE DISPOSITIVO", C.accent], MANUAL: ["REGISTRO MANUAL", C.muted], NONE: ["SEM LEITURAS NO PERÍODO", C.muted],
};
// Fontes padrão do PDF só codificam WinAnsi: o resto é trocado por equivalente legível em vez de quebrar a geração.
const SUBST: Record<string, string> = { "→": "->", "≥": ">=", "≤": "<=", "×": "x", " ": " ", " ": " ", " ": " " };

/** Data do arquivo no fuso de São Paulo: richards-relatorio-AAAA-MM-DD.pdf. */
export function reportFileName(now = new Date()) {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return `richards-relatorio-${d}.pdf`;
}

class Writer {
  constructor(readonly page: PDFPage, readonly font: PDFFont, readonly bold: PDFFont, private readonly charset: Set<number>) {}
  safe(t: string) { return [...t.normalize("NFC")].map(ch => this.charset.has(ch.codePointAt(0)!) ? ch : SUBST[ch] ?? "?").join(""); }
  fit(t: string, size: number, max: number, f = this.font) {
    let s = this.safe(t);
    if (f.widthOfTextAtSize(s, size) <= max) return s;
    while (s.length > 1 && f.widthOfTextAtSize(s + "…", size) > max) s = s.slice(0, -1);
    return s.trimEnd() + "…";
  }
  text(t: string, x: number, y: number, o: { size?: number; bold?: boolean; color?: RGB; max?: number; right?: boolean } = {}) {
    const size = o.size ?? 9, f = o.bold ? this.bold : this.font;
    const s = o.max ? this.fit(t, size, o.max, f) : this.safe(t);
    const dx = o.right ? f.widthOfTextAtSize(s, size) : 0;
    this.page.drawText(s, { x: x - dx, y, size, font: f, color: o.color ?? C.ink });
  }
  wrap(t: string, x: number, y: number, width: number, o: { size?: number; color?: RGB; lead?: number } = {}) {
    const size = o.size ?? 8.5, lead = o.lead ?? size * 1.45;
    let line = "", yy = y;
    for (const word of this.safe(t).split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (this.font.widthOfTextAtSize(next, size) > width && line) { this.page.drawText(line, { x, y: yy, size, font: this.font, color: o.color ?? C.muted }); yy -= lead; line = word; }
      else line = next;
    }
    if (line) { this.page.drawText(line, { x, y: yy, size, font: this.font, color: o.color ?? C.muted }); yy -= lead; }
    return yy;
  }
  /** Altura que `wrap` vai ocupar (para desenhar a caixa antes do texto, do tamanho certo). */
  measure(t: string, width: number, size = 8.5, lead = size * 1.45) {
    let lines = 0, line = "";
    for (const word of this.safe(t).split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (this.font.widthOfTextAtSize(next, size) > width && line) { lines++; line = word; } else line = next;
    }
    return (lines + (line ? 1 : 0)) * lead;
  }
  /** Caixa de notas: título + parágrafos, com altura calculada. Devolve a base da caixa. */
  notes(title: string, paragraphs: string[], top: number) {
    const width = W - 2 * M - 24;
    const h = 30 + paragraphs.reduce((n, t) => n + this.measure(t, width) + 4, 0) + 6;
    this.rect(M, top - h, W - 2 * M, h, C.soft);
    this.text(title, M + 12, top - 16, { size: 7.5, bold: true, color: C.accent });
    let y = top - 30;
    for (const t of paragraphs) y = this.wrap(t, M + 12, y, width) - 4;
    return top - h;
  }
  rect(x: number, y: number, w: number, h: number, color: RGB, border?: RGB) { this.page.drawRectangle({ x, y, width: w, height: h, color, borderColor: border, borderWidth: border ? 0.8 : 0 }); }
  line(x1: number, y1: number, x2: number, y2: number, color = C.line, t = 0.7) { this.page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: t, color }); }
  section(title: string, y: number, note?: string) {
    this.text(title, M, y, { size: 12, bold: true });
    if (note) this.text(note, W - M, y + 1, { size: 8, color: C.faint, right: true, max: 250 });
    this.line(M, y - 6, W - M, y - 6, C.line, 0.8);
  }
  table(cols: { label: string; w: number; right?: boolean }[], rows: string[][], top: number, step = 15) {
    let x = M;
    this.rect(M, top - 4, W - 2 * M, 16, C.soft);
    for (const c of cols) { this.text(c.label.toUpperCase(), c.right ? x + c.w - 4 : x + 4, top + 1, { size: 6.8, bold: true, color: C.muted, right: c.right }); x += c.w; }
    let y = top - 16;
    for (const r of rows) {
      x = M;
      r.forEach((cell, i) => { const c = cols[i]; this.text(cell, c.right ? x + c.w - 4 : x + 4, y, { size: 8.2, max: c.w - 8, right: c.right }); x += c.w; });
      this.line(M, y - 5, W - M, y - 5, C.line, 0.5);
      y -= step;
    }
    return y;
  }
}

function filterText(d: DashboardDTO) {
  const f = d.filter;
  const device = f.deviceId ? d.devices.find(x => x.id === f.deviceId)?.code ?? f.deviceId : "todos os sensores";
  const site = f.siteId ? d.options.sites.find(s => s.id === f.siteId)?.name ?? f.siteId : "todas as unidades";
  const source = { ALL: "todas as origens", DEVICE: "somente sensor", SIMULATED: "somente simulado", MANUAL: "somente manual" }[f.source];
  return `${site} · ${device} · ${source}`;
}

function header(w: Writer, d: DashboardDTO, title: string, subtitle: string, now: Date) {
  w.rect(0, H - 78, W, 78, C.band);
  w.rect(0, H - 81, W, 3, C.accent);
  w.text("RICHARDS INTELLIGENCE", M, H - 34, { size: 8, bold: true, color: C.accentSoft });
  w.text(title, M, H - 56, { size: 17, bold: true, color: C.white, max: 360 });
  w.text(subtitle, M, H - 70, { size: 8.5, color: rgb(0.74, 0.84, 0.82), max: 330 });
  const [stamp, color] = STAMP[d.provenance.label];
  const sw = w.bold.widthOfTextAtSize(w.safe(stamp), 8) + 18;
  w.page.drawRectangle({ x: W - M - sw, y: H - 60, width: sw, height: 20, color: C.white, borderColor: color, borderWidth: 1.4 });
  w.text(stamp, W - M - sw + 9, H - 53, { size: 8, bold: true, color });
  w.text(`Gerado em ${dateBR(now)} (Brasília)`, W - M, H - 72, { size: 7.5, color: rgb(0.74, 0.84, 0.82), right: true });
}

function footer(w: Writer, n: number, total: number, now: Date) {
  w.line(M, 40, W - M, 40);
  w.text(`RICHARDS Intelligence · ${REPORT_VERSION} · gerado em ${dateBR(now)}`, M, 28, { size: 7.5, color: C.faint });
  w.text(`Página ${n} de ${total}`, W - M, 28, { size: 7.5, color: C.faint, right: true });
}

function volumeChart(w: Writer, d: DashboardDTO, top: number, height: number) {
  const left = M + 38, right = W - M, bottom = top - height, width = right - left;
  const values = d.series.map(p => p.liters ?? 0);
  const max = Math.max(1, ...values);
  const nice = (() => { const p = 10 ** Math.floor(Math.log10(max)); return Math.ceil(max / p) * p; })();
  for (const k of [0, 0.5, 1]) {
    const y = bottom + height * k;
    w.line(left, y, right, y, k === 0 ? C.faint : C.line, k === 0 ? 0.8 : 0.5);
    w.text(`${numBR(nice * k, 0)} L`, left - 6, y - 3, { size: 7, color: C.muted, right: true });
  }
  const n = d.series.length, slot = width / n, bw = Math.max(0.8, slot * 0.72);
  d.series.forEach((p, i) => {
    const x = left + i * slot + (slot - bw) / 2;
    if (p.liters !== null && p.liters > 0) w.rect(x, bottom, bw, Math.max(0.6, (p.liters / nice) * height), p.partial ? C.accentSoft : C.accent);
    if (p.occurrences > 0) w.page.drawCircle({ x: x + bw / 2, y: top + 6, size: 2.6, color: C.danger });
  });
  const idx = [0, Math.floor(n / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i);
  for (const i of idx) w.text(bucketLabel(d.series[i].t, d.filter.bucket, true), left + i * slot + slot / 2, bottom - 12, { size: 7, color: C.muted, right: i === n - 1 });
  w.page.drawCircle({ x: left + 2, y: bottom - 26, size: 2.6, color: C.danger });
  w.text("intervalo com ocorrência aberta", left + 9, bottom - 28.5, { size: 7, color: C.muted });
  w.rect(left + 150, bottom - 30, 8, 6, C.accentSoft);
  w.text("intervalo em andamento", left + 162, bottom - 28.5, { size: 7, color: C.muted });
  w.text("sem barra = sem leitura (lacuna, não zero)", left + 270, bottom - 28.5, { size: 7, color: C.muted });
}

/**
 * Relatório de 2 páginas montado a partir do MESMO DashboardDTO que o BI exibe (mesmo filtro, mesmo serviço).
 * Os números-resumo são as strings de `reportFigures`, idênticas às da prévia em /relatorios.
 */
export async function buildReportPdf(d: DashboardDTO, now = new Date()) {
  const pdf = await PDFDocument.create();
  pdf.setTitle("RICHARDS Intelligence — Relatório de monitoramento hidráulico");
  pdf.setAuthor("RICHARDS Intelligence");
  pdf.setCreationDate(now);
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const charset = new Set(font.getCharacterSet());
  const period = `${dateBR(d.filter.from)} -> ${dateBR(d.filter.to)}`;

  // ---------- página 1: monitoramento ----------
  const p1 = new Writer(pdf.addPage([W, H]), font, bold, charset);
  header(p1, d, "Relatório de monitoramento hidráulico", `${d.organization.name} · ${d.organization.city}`, now);
  p1.text("Período", M, 732, { size: 7.5, bold: true, color: C.muted });
  p1.text(`${period} (horário de Brasília)`, M, 720, { size: 10, bold: true });
  p1.text("Recorte", 360, 732, { size: 7.5, bold: true, color: C.muted });
  p1.wrap(filterText(d), 360, 720, W - M - 360, { size: 8.5, color: C.ink, lead: 11 });

  const figs = reportFigures(d);
  const bw = (W - 2 * M - 20) / 3;
  figs.forEach(([label, value], i) => {
    const x = M + (i % 3) * (bw + 10), y = 650 - Math.floor(i / 3) * 60;
    p1.rect(x, y, bw, 50, C.soft, C.line);
    p1.text(label, x + 10, y + 34, { size: 7.8, color: C.muted, max: bw - 20 });
    p1.text(value, x + 10, y + 12, { size: 16, bold: true, max: bw - 20 });
  });
  p1.text(`${d.kpis.activeOccurrences} ativa(s) agora = ${d.kpis.openOccurrences} aberta(s) + ${d.kpis.acknowledgedOccurrences} em análise. Tempo até resolução = média das resolvidas no período (abertura -> encerramento).`, M, 576, { size: 7.5, color: C.muted, max: W - 2 * M });

  p1.section("Volume observado por intervalo (litros)", 548, `${d.provenance.samples} leituras · ${d.filter.bucket === "15m" ? "a cada 15 min" : d.filter.bucket === "1h" ? "por hora" : "por dia"}`);
  if (d.provenance.samples) volumeChart(p1, d, 515, 130);
  else p1.text("Sem leituras no período e recorte escolhidos: nenhum volume é exibido (não é zero medido).", M, 470, { size: 9, color: C.muted });

  p1.section("Dispositivos e qualidade dos dados", 320);
  p1.table([{ label: "Sensor", w: 120 }, { label: "Descrição", w: 150 }, { label: "Comunicação", w: 95 }, { label: "Último contato", w: 85 }, { label: "Leituras", w: 65, right: true }],
    d.devices.slice(0, 5).map(x => [x.code, x.label, CONNECTIVITY[x.connectivity] ?? x.connectivity, x.lastSeen ? dateBR(x.lastSeen) : "nunca", String(x.samples)]), 300);

  const afterDevices = 300 - 16 - Math.min(5, d.devices.length) * 15;
  p1.notes("NOTA METODOLÓGICA", [
    "O sensor YF-S201 registra fluxo (pulsos convertidos em litros). Volume observado é medição; não prova desperdício, vazamento nem economia. Uma ocorrência indica fluxo contínuo acima do limiar configurado e exige verificação humana.",
    `Origem das leituras: ${d.provenance.sources.map(s => `${SOURCE[s.source]} ${s.samples}`).join(" · ") || "nenhuma"}. Primeira leitura: ${d.provenance.firstReading ? dateBR(d.provenance.firstReading) : "—"}; última: ${d.provenance.lastReading ? dateBR(d.provenance.lastReading) : "—"}. Dados simulados aparecem carimbados no topo desta página.`,
    `Regra de alerta do recorte: ${d.threshold ? `vazão >= ${numBR(d.threshold.minFlowLpm, 2)} L/min por ${d.threshold.continuousSeconds} s contínuos` : "sensores com regras diferentes"}. Intervalos sem leitura são lacunas (não zero).`,
  ], afterDevices - 24);
  footer(p1, 1, 2, now);

  // ---------- página 2: ocorrências e doações ----------
  const p2 = new Writer(pdf.addPage([W, H]), font, bold, charset);
  header(p2, d, "Ocorrências e investigação", `${period} · ${filterText(d)}`, now);
  p2.section("Ocorrências do recorte", 735, "abertas no período ou ainda ativas");
  const occ = d.occurrences.slice(0, 14);
  let y2 = occ.length ? p2.table([
    { label: "ID", w: 76 }, { label: "Ocorrência", w: 140 }, { label: "Sever.", w: 42 }, { label: "Estado", w: 60 }, { label: "Aberta", w: 86 }, { label: "Resolução", w: 58, right: true }, { label: "Origem", w: 53 },
  ], occ.map(o => [o.id, o.title, SEVERITY[o.severity] ?? o.severity, STATUS[o.status] ?? o.status, dateBR(o.openedAt), durationBR(o.resolutionMin), SOURCE[o.source] ?? o.source]), 715) : 700;
  if (!occ.length) p2.text("Nenhuma ocorrência no recorte.", M, 700, { size: 9, color: C.muted });
  if (d.occurrences.length > occ.length) { p2.text(`+ ${d.occurrences.length - occ.length} ocorrência(s) no recorte; lista completa no BI (/ocorrencias).`, M, y2, { size: 7.5, color: C.muted }); y2 -= 12; }

  p2.notes("PROVENIÊNCIA E LIMITES", [
    "Números gerados pelo mesmo serviço e filtro do BI. Volume observado não significa desperdício nem economia comprovados.",
    "Ocorrência de fluxo contínuo exige investigação humana. O mapa é esquemático; pontos sem sensor não recebem leitura. Medidores em série não devem ser somados como consumos independentes.",
    "Protótipo do Hackathon Senac Ribeirão Preto 2026. Não substitui projeto hidráulico, inspeção profissional ou calibração física.",
  ], y2 - 30);
  footer(p2, 2, 2, now);

  return pdf.save();
}
