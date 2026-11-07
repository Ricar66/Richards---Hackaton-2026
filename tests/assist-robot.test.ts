import test from "node:test";
import assert from "node:assert/strict";
import { parseRobotMode, robotGreeting, robotView } from "../src/components/bi/assist-robot-state";

test("robô: valor gravado desconhecido ou ausente volta a andar", () => {
  assert.equal(parseRobotMode(null), "andando");
  assert.equal(parseRobotMode(undefined), "andando");
  assert.equal(parseRobotMode("voar"), "andando");
  assert.equal(parseRobotMode("parado"), "parado");
  assert.equal(parseRobotMode("oculto"), "oculto");
});

test("robô: reduzir movimento deixa parado; escondido e tela do assistente não mostram", () => {
  assert.equal(robotView("andando", false, "/"), "andando");
  assert.equal(robotView("andando", true, "/monitoramento"), "parado", "reduzir movimento vence a escolha de andar");
  assert.equal(robotView("parado", false, "/"), "parado");
  assert.equal(robotView("oculto", false, "/"), null);
  assert.equal(robotView("andando", false, "/assistente"), null);
  assert.equal(robotView("andando", false, "/assistente/x"), null);
  assert.equal(robotView("andando", false, "/assistentes"), "andando", "só a rota do assistente, não prefixo solto");
});

test("robô: fala usa a contagem do servidor e nunca inventa número", () => {
  assert.equal(robotGreeting(null), "Oi! Sou o RICHARDS Assist. Posso ajudar?");
  assert.equal(robotGreeting(0), "Oi! Sou o RICHARDS Assist. Posso ajudar?");
  assert.equal(robotGreeting(Number.NaN), "Oi! Sou o RICHARDS Assist. Posso ajudar?");
  assert.equal(robotGreeting(-2), "Oi! Sou o RICHARDS Assist. Posso ajudar?");
  assert.equal(robotGreeting(1), "Há 1 ocorrência ativa. Quer ajuda para entender?");
  assert.equal(robotGreeting(3), "Há 3 ocorrências ativas. Quer ajuda para entender?");
});
