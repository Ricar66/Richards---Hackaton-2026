// Renderiza docs/dados/mer.mmd e der.mmd em SVG, PNG e um PDF único (MER_DER.pdf).
// Uso: node scripts/docs/render-diagramas.mjs
// Usa o puppeteer-core que já é dependência de desenvolvimento (E2E) e o Chrome instalado (CHROME_PATH se não for o padrão).
// O Mermaid vem do CDN numa versão fixa: precisa de internet só na hora de gerar.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";
import { PDFDocument } from "pdf-lib";

const MERMAID = "https://cdn.jsdelivr.net/npm/mermaid@11.12.0/dist/mermaid.min.js";
const dir = resolve("docs/dados");
const chromePath = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find(p => existsSync(p));
if (!chromePath) { console.error("Chrome não encontrado: defina CHROME_PATH."); process.exit(1); }

const diagrams = [
  // Orientação de cada página do PDF segue o formato do diagrama (o DER é quase quadrado: retrato aproveita mais a folha).
  { key: "MER", file: "mer.mmd", title: "MER — Modelo Entidade-Relacionamento (conceitual)", size: "A3 landscape", height: "271mm" },
  { key: "DER", file: "der.mmd", title: "DER — Diagrama Entidade-Relacionamento (lógico)", size: "A3 portrait", height: "394mm" },
];
const config = {
  startOnLoad: false, theme: "base", securityLevel: "loose",
  fontFamily: "Arial, Helvetica, sans-serif",
  themeVariables: {
    fontFamily: "Arial, Helvetica, sans-serif", fontSize: "15px",
    primaryColor: "#ffffff", primaryBorderColor: "#0f2128", primaryTextColor: "#0f2128",
    lineColor: "#4f6970", secondaryColor: "#e3f1ee", tertiaryColor: "#f3f6f5", edgeLabelBackground: "#ffffff",
    attributeBackgroundColorOdd: "#ffffff", attributeBackgroundColorEven: "#f3f6f5", rowOdd: "#ffffff", rowEven: "#f3f6f5",
  },
  flowchart: { htmlLabels: true, curve: "basis", nodeSpacing: 34, rankSpacing: 46, padding: 10, useMaxWidth: false },
  er: { layoutDirection: "LR", minEntityWidth: 120, entityPadding: 12, fontSize: 14, useMaxWidth: false },
};

const browser = await puppeteer.launch({ executablePath: chromePath, headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
  await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff"><div id="out" style="display:inline-block;padding:24px;background:#fff"></div><script src="${MERMAID}"></script></body>`, { waitUntil: "networkidle0" });
  await page.evaluate(c => window.mermaid.initialize(c), config);
  const rendered = [];
  for (const d of diagrams) {
    const code = readFileSync(resolve(dir, d.file), "utf8");
    const svg = await page.evaluate(async (id, src) => (await window.mermaid.render(id, src)).svg, `d-${d.key}`, code);
    writeFileSync(resolve(dir, `${d.key}.svg`), svg);
    await page.evaluate(s => { document.getElementById("out").innerHTML = s; }, svg);
    const el = await page.$("#out");
    await el.screenshot({ path: resolve(dir, `${d.key}.png`) });
    rendered.push({ ...d, svg });
    console.log(`${d.key}: SVG e PNG gerados`);
  }

  // PDF: uma página A3 por diagrama, ajustado à folha, com legenda de leitura; as páginas são unidas num arquivo só.
  const legend = {
    MER: "Retângulo = entidade · losango = relacionamento · ● identificador · ○ atributo · tracejado = previsto para expansão (sem uso no MVP). "
      + "(mín,máx) junto a uma entidade indica com quantas ocorrências dela uma ocorrência da outra ponta se relaciona. "
      + "Ex.: ORGANIZAÇÃO (1,1) — possui — (0,N) USUÁRIO: uma organização tem de 0 a N usuários; cada usuário pertence a exatamente 1 organização.",
    DER: "Tabelas e colunas com nomes físicos do PostgreSQL. PK = chave primária · FK = chave estrangeira · UK = único · \"opcional\" = aceita nulo. "
      + "Linhas no padrão pé de galinha: || exatamente um · |o zero ou um · o{ zero ou muitos. Rótulo da linha = coluna FK. "
      + "AuditEvent aponta para Occurrence ou DonationBatch por entity + entityId (referência lógica, sem FK).",
  };
  const merged = await PDFDocument.create();
  for (const d of rendered) {
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      @page { size: ${d.size}; margin: 12mm; }
      body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #0f2128; }
      .pg { height: ${d.height}; display: flex; flex-direction: column; }
      header h1 { font-size: 20px; margin: 0 0 4px; } header p { margin: 0 0 8px; font-size: 11px; color: #55656b; }
      header { border-bottom: 2px solid #137e77; margin-bottom: 8px; }
      .fig { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
      .fig svg { max-width: 100% !important; max-height: 100%; width: auto; height: 100%; }
      footer { font-size: 11px; line-height: 1.45; color: #33474d; border-top: 1px solid #d5dfdd; padding-top: 6px; margin-top: 6px; }
    </style><body><section class="pg"><header><h1>${d.title}</h1><p>RICHARDS Intelligence · PostgreSQL 16 · fonte: prisma/schema.prisma e migrations aplicadas · 03/11/2026</p></header>
      <div class="fig">${d.svg}</div><footer>${legend[d.key]}</footer></section></body>`, { waitUntil: "load" });
    const part = await PDFDocument.load(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
    for (const p of await merged.copyPages(part, part.getPageIndices())) merged.addPage(p);
  }
  merged.setTitle("RICHARDS Intelligence — MER e DER");
  writeFileSync(resolve(dir, "MER_DER.pdf"), await merged.save());
  console.log("MER_DER.pdf gerado");
} finally {
  await browser.close();
}
