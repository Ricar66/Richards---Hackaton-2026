import { test } from "node:test";
import assert from "node:assert/strict";
import { isPassportToken, passportCode, passportStamps, passportWindow, publicName, tempSourceFor, PASSPORT_VERDICT } from "../src/modules/donations/domain/passport";
import { newPassportToken } from "../src/modules/donations/infrastructure/passport-token";
import { sparkline } from "../src/components/passport/spark";
import { DEFAULT_RANGE } from "../src/modules/cold-chain/domain/cold-chain";
import { isLoopbackUrl, publicBaseUrl } from "../src/lib/public-url";

test("token: 128 bits em hex, sempre novo, e só esse formato é aceito", () => {
  const a = newPassportToken(), b = newPassportToken();
  assert.match(a, /^[a-f0-9]{32}$/);
  assert.notEqual(a, b);
  assert.ok(isPassportToken(a));
  for (const bad of ["", a.slice(1), a + "0", a.toUpperCase(), `${a.slice(0, 31)}g`, "../../etc/passwd", `${a}/x`]) assert.equal(isPassportToken(bad), false, bad);
  assert.equal(passportCode("0a1b2c3d4e5f60718293a4b5c6d7e8f9"), "0A1B2C");
});

test("nome público: primeiro nome + inicial do último sobrenome, sem partículas; nunca o nome completo", () => {
  assert.equal(publicName("Paula Mendes"), "Paula M.");
  assert.equal(publicName("  ricardo   Coradini de Marco moretti "), "Ricardo M.");
  assert.equal(publicName("Ana"), "Ana");
  assert.equal(publicName("Maria da"), "Maria");
  assert.equal(publicName(""), null);
  assert.equal(publicName(null), null);
  assert.ok(!publicName("Paula Mendes")!.includes("Mendes"));
});

test("janela da temperatura: 24 h antes da pesagem até a entrega (ou agora), no máximo 7 dias depois", () => {
  const created = new Date("2026-11-08T12:00:00Z"), now = new Date("2026-11-08T15:00:00Z");
  const open = passportWindow(created, null, now);
  assert.equal(open.from.toISOString(), "2026-11-07T12:00:00.000Z");
  assert.equal(open.to.toISOString(), now.toISOString());
  assert.equal(open.open, true); assert.equal(open.capped, false);
  const delivered = passportWindow(created, new Date("2026-11-08T13:00:00Z"), now);
  assert.equal(delivered.to.toISOString(), "2026-11-08T13:00:00.000Z");
  assert.equal(delivered.open, false);
  const old = passportWindow(created, null, new Date("2026-11-30T00:00:00Z"));
  assert.equal(old.to.toISOString(), "2026-11-15T12:00:00.000Z");
  assert.equal(old.capped, true);
  // Relógio torto (fim antes do começo) não vira janela negativa.
  const skew = passportWindow(created, new Date("2026-11-01T00:00:00Z"), now);
  assert.ok(skew.to >= skew.from);
});

test("origem da temperatura: lote simulado só com série simulada; real e manual só com a do sensor", () => {
  assert.equal(tempSourceFor("SIMULATED"), "SIMULATED");
  assert.equal(tempSourceFor("DEVICE"), "DEVICE");
  assert.equal(tempSourceFor("MANUAL"), "DEVICE");
});

test("veredito e carimbos: cancelado manda não consumir; etapa não alcançada fica sem data", () => {
  assert.match(PASSPORT_VERDICT.CANCELLED.text, /Não distribua nem consuma/);
  assert.equal(PASSPORT_VERDICT.PENDING_REVIEW.tone, "wait");
  const s = passportStamps({ createdAt: new Date("2026-11-08T12:00:00Z"), verifiedAt: new Date("2026-11-08T12:30:00Z"), reservedAt: null, deliveredAt: null }, true);
  assert.deepEqual(s.map(x => x.key), ["WEIGHED", "TRIAGED", "RESERVED", "DELIVERED"]);
  assert.equal(s[0].label, "Pesado na balança");
  assert.deepEqual(s.map(x => x.at !== null), [true, true, false, false]);
  assert.equal(passportStamps({ createdAt: new Date(), verifiedAt: null, reservedAt: null, deliveredAt: null }, false)[0].label, "Registrado");
});

test("gráfico: eixo inclui o limite e marca fora da faixa pela regra da norma (5 °C é FORA na geladeira)", () => {
  const t0 = Date.parse("2026-11-08T12:00:00Z");
  const series = [3, 4, 5, 4.5, 3.8].map((c, i) => ({ t: t0 + i * 60_000, c, max: c }));
  const sp = sparkline(series, DEFAULT_RANGE.REFRIGERATOR, 320, 96)!;
  assert.ok(sp.hi > 5 && sp.lo < 3);
  assert.equal(sp.out.length, 1, "só o 5,0 °C (limite exclusivo) fica fora");
  assert.ok(sp.band.top > 0 && sp.band.bottom === 96, "geladeira: faixa do limite até embaixo");
  // Pico escondido pela média da fatia também aparece (usa o máximo).
  const hidden = [{ t: t0, c: 4, max: 4 }, { t: t0 + 60_000, c: 4.6, max: 7.2 }];
  assert.equal(sparkline(hidden, DEFAULT_RANGE.REFRIGERATOR, 320, 96)!.out.length, 1);
  // Freezer: −18 °C é DENTRO (inclusivo).
  const fz = [-20, -18, -17].map((c, i) => ({ t: t0 + i * 60_000, c, max: c }));
  assert.equal(sparkline(fz, DEFAULT_RANGE.FREEZER, 320, 96)!.out.length, 1);
  assert.equal(sparkline(series.slice(0, 1), DEFAULT_RANGE.REFRIGERATOR, 320, 96), null);
  assert.match(sp.line, /^M[\d.]+,[\d.]+(L[\d.]+,[\d.]+){4}$/);
});

test("URL pública: RICHARDS_PUBLIC_URL vale primeiro; host estranho cai no localhost; aviso de loopback", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  delete process.env.RICHARDS_PUBLIC_URL;
  assert.equal(publicBaseUrl(h({ host: "192.168.0.20:3000" })), "http://192.168.0.20:3000");
  assert.equal(publicBaseUrl(h({ host: "x", "x-forwarded-host": "richards.exemplo.org", "x-forwarded-proto": "https" })), "https://richards.exemplo.org");
  assert.equal(publicBaseUrl(h({ host: "evil.com/<script>" })), "http://localhost:3000");
  assert.equal(publicBaseUrl(h({ host: "a.com", "x-forwarded-proto": "javascript" })), "http://a.com");
  process.env.RICHARDS_PUBLIC_URL = "https://loja.exemplo.org/qualquer/caminho";
  assert.equal(publicBaseUrl(h({ host: "localhost:3000" })), "https://loja.exemplo.org");
  process.env.RICHARDS_PUBLIC_URL = "ftp://x";
  assert.equal(publicBaseUrl(h({ host: "10.0.0.5:3000" })), "http://10.0.0.5:3000");
  delete process.env.RICHARDS_PUBLIC_URL;
  assert.ok(isLoopbackUrl("http://localhost:3000/p/x"));
  assert.ok(isLoopbackUrl("http://127.0.0.1:3000/p/x"));
  assert.equal(isLoopbackUrl("http://192.168.0.20:3000/p/x"), false);
});

test("gráfico: buraco sem leitura quebra a linha (nunca desenha medição que não existiu)", () => {
  const t0 = Date.parse("2026-11-08T12:00:00Z"), min = 60_000;
  // 1 por minuto, buraco de 40 min, volta 1 por minuto.
  const ts = [0, 1, 2, 3, 43, 44, 45].map(m => t0 + m * min);
  const sp = sparkline(ts.map(t => ({ t, c: 3, max: 3 })), DEFAULT_RANGE.REFRIGERATOR, 320, 96)!;
  assert.equal((sp.line.match(/M/g) ?? []).length, 2, sp.line);
  // Série contínua (mesmo com passo de 15 min das fatias) não quebra.
  const sliced = Array.from({ length: 8 }, (_, i) => ({ t: t0 + i * 15 * min, c: 3, max: 3 }));
  assert.equal((sparkline(sliced, DEFAULT_RANGE.REFRIGERATOR, 320, 96)!.line.match(/M/g) ?? []).length, 1);
  // Uma fatia vazia no meio das fatias (30 min) quebra.
  const holed = sliced.filter((_, i) => i !== 4);
  assert.equal((sparkline(holed, DEFAULT_RANGE.REFRIGERATOR, 320, 96)!.line.match(/M/g) ?? []).length, 2);
});

test("destaque da temperatura: verde só com série boa; pouca cobertura vira aviso com a cobertura escrita", async () => {
  const { coldHeadline } = await import("../src/modules/donations/domain/passport");
  assert.deepEqual(coldHeadline(null, 0, 0), { tone: "none", note: null });
  assert.equal(coldHeadline(100, 98, 0).tone, "clean");
  assert.equal(coldHeadline(98.6, 98, 1).tone, "warned");
  const low = coldHeadline(100, 8.3, 0);
  assert.equal(low.tone, "partial", "100% de 8% da janela não pode sair verde");
  assert.match(low.note!, /Só 8,3% da janela tem leitura/);
  assert.equal(coldHeadline(100, 79.9, 0).tone, "partial");
  assert.equal(coldHeadline(100, 80, 0).tone, "clean");
});

test("gráfico: o eixo do tempo é a janela inteira; 2 h de dado em 24 h ocupam só a ponta direita", () => {
  const to = Date.parse("2026-11-08T12:00:00Z"), from = to - 24 * 3600_000;
  const series = Array.from({ length: 12 }, (_, i) => ({ t: to - (11 - i) * 10 * 60_000, c: 3, max: 3 }));
  const sp = sparkline(series, DEFAULT_RANGE.REFRIGERATOR, 320, 96, 6, [from, to])!;
  const firstX = Number(sp.line.match(/^M([\d.]+),/)![1]);
  assert.ok(firstX > 280, `começa perto da direita (x=${firstX})`);
  const stretched = sparkline(series, DEFAULT_RANGE.REFRIGERATOR, 320, 96)!;
  assert.equal(Number(stretched.line.match(/^M([\d.]+),/)![1]), 6, "sem janela, começa na borda");
});
