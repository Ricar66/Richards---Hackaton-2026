# Equipe de quatro pessoas — contratos de trabalho e entregas

## Responsabilidades sem sobreposição de propriedade

| Papel | Responsável | Entrega funcional | Critério de aceite | Apoia |
|---|---|---|---|---|
| Dev 1 — Frontend/BI | Desenvolvedor A | Shell React, UX, filtros, Recharts, drilldown, doações UI, PDF download e responsividade | Painel conectado ao Postgres por APIs; sem números inventados; ações persistem | Dev 2 nos DTOs |
| Dev 2 — Backend/DB/Infra | Desenvolvedor B | Prisma, Docker, APIs, casos de uso, autenticação, permissões, analytics, PDF server | Comandos passam e endpoints testados; dados auditáveis | IoT 2 na ingestão |
| IoT 1 — Eletrônica/hidráulica | Integrante C | Sensor de vazão, reservatório, bomba isolada, proteção, calibração e datasheet | Circuito seguro, leitura dentro do erro medido, protocolo de teste | IoT 2 na calibração |
| IoT 2 — Firmware/rede | Integrante D | ESP32, Wi-Fi, NTP, serial, POST/queue e simulação contingente | 202 real/simulado, sem duplicar, reconexão testada | Dev 2 no contrato |

## Pontos de integração que não podem mudar sem consenso
1. Payload `/api/iot/telemetry`: `deviceCode`, `bootId`, `sequence`, `flowLpm`, `deltaLiters`, `capturedAt` (UTC ISO).
2. `source` é classificada no servidor: `DEVICE`, `SIMULATED`, `MANUAL`.
3. DTO Analytics: `from`, `to`, `siteId?`, `deviceId?`, `source?`, com mesmas somas em BI e PDF.
4. Fluxos: `OPEN -> ACKNOWLEDGED -> RESOLVED/DISMISSED`; `PENDING_REVIEW -> AVAILABLE -> RESERVED -> DELIVERED`.
5. Sensor e software compartilham `deviceCode=RICHARDS-FLOW-001`, mas segredo nunca aparece nos commits.

## Rotina diária sugerida (15 minutos)
- Cada pessoa relata: o que ficou pronto, próximo passo, bloqueios e evidências.
- Ajustes de contrato IoT/API devem ser registrados em `docs/plano/05_API_E_CONTRATOS.md` antes de mudar ambos os lados.
- Dev 1 usa DTO demonstrativo tipado até Dev 2 entregar API; dados exemplificativos recebem selo demo.
- IoT 2 usa simulador para fechar backend enquanto IoT 1 calibra circuito.
- Nenhum integrante declara tarefa Done sem teste de aceite registrado.

## Fluxo Git
- `main`: sempre estável para a demonstração.
- `dev`: integração (se equipe optar por branch dedicada).
- Branches: `feat/iot-telemetry`, `feat/bi-native`, `feat/donations`, `fix/prisma-build`.
- PR pequeno com escopo, screenshots para UI, saída de testes, migração/contrato se alterado.
- Nunca commitar `.env`, `secrets.h`, certificado, token ou credencial de dispositivo.

## Definição de pronto (DoD)
- Código integra com contrato e schema; fluxo funciona com dados persistidos.
- Inputs inválidos falham com status HTTP esperado.
- Dados demo sempre rotulados; sem inventar economia de água ou segurança alimentar.
- Responsivo desktop/mobile; documentação mínima atualizada.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm build` verificados **quando possível**; resultados reais publicados.

## Plano B de palco
- Se firmware/circuito cair: `scripts/iot-simulator.mjs` gera `SIMULATED` explicitamente.
- Se BI React estiver incompleto: `/operacao` mantém jornada real; prévia HTML V3 é recurso visual, não prova de persistência.
- Se PDF falhar: tabela de resultados persistidos, sem chamar screenshot de PDF gerado.
