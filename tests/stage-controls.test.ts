import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LiveStage } from '../src/components/stage/live-stage';
import { TwinSlot } from '../src/components/stage/twin-slot';

test('Sala sem banco e sem atalhos mantém controles acessíveis sem inventar leituras', () => {
  const html = renderToStaticMarkup(createElement(LiveStage, { initial: null, initialError: 'database', pinnedCode: null, shortcuts: false, initial3d: false }));
  assert.match(html, /nenhum número é exibido/);
  assert.match(html, /Pausar movimento/);
  assert.match(html, /Solicitar 3D/);
  assert.match(html, /Diagnóstico/);
  assert.match(html, /aria-pressed="false"/);
  assert.doesNotMatch(html, /stage-control-shortcuts/);
});

test('Sala solicita 3D automaticamente, conserva opção 2D e não anuncia 3D ativo antes da sonda', () => {
  const html = renderToStaticMarkup(createElement(LiveStage, { initial: null, initialError: null, pinnedCode: null }));
  assert.match(html, /Usar SVG 2D/);
  assert.match(html, /SVG 2D · preparando 3D/);
  assert.doesNotMatch(html, /3D ATIVO/);
});

test('Gêmeo não mostra vazão residual como atual quando perdeu leitura; ampliação funciona também no SVG', () => {
  const html = renderToStaticMarkup(createElement(TwinSlot, { flowLpm: 8.2, tone: 'ok', simulated: true, live: false, pulseKey: null, still: false, reduced: false, want3d: false, diag: false }));
  assert.match(html, /sem leitura recente/);
  assert.doesNotMatch(html, /8,20/);
  assert.match(html, /Ampliar gêmeo/);
  assert.match(html, /leitura simulada/);
});

test('Reduzir movimento preserva SVG e explica o fallback mesmo com 3D solicitado', () => {
  const html = renderToStaticMarkup(createElement(TwinSlot, { flowLpm: null, tone: 'ok', simulated: false, live: false, pulseKey: null, still: true, reduced: true, want3d: true, diag: false }));
  assert.match(html, /data-twin-mode="svg"/);
  assert.match(html, /data-twin-reason="reduced"/);
  assert.match(html, /role="status"/);
  assert.match(html, /SVG 2D · reduzir movimento do sistema/);
  assert.doesNotMatch(html, /<canvas/);
});
