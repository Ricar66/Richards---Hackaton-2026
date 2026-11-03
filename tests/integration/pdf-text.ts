import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
/** Extrai o texto desenhado (operadores Tj) de um PDF gerado pelo pdf-lib, para conferir números sem dependência nova. */
export function pdfText(bytes: Uint8Array) {
  const raw = Buffer.from(bytes).toString("latin1");
  const out: string[] = [];
  const decoder = new TextDecoder("windows-1252");
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let body: string;
    try { body = inflateSync(Buffer.from(m[1], "latin1")).toString("latin1"); } catch { body = m[1]; }
    for (const t of body.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) out.push(decoder.decode(Buffer.from(t[1], "hex")));
  }
  return out.join("\n");
}
/** Páginas e tamanho (pt) lidos pelo próprio pdf-lib: o arquivo precisa reabrir sem erro. */
export async function pageSizes(bytes: Uint8Array) {
  return (await PDFDocument.load(bytes)).getPages().map(p => p.getSize()).map(s => [Math.round(s.width), Math.round(s.height)]);
}
