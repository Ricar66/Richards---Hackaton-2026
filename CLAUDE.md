# RICHARDS Intelligence

Antes de qualquer tarefa, leia a memória do projeto e as regras para agentes:

@MEMORIA.md
@AGENTS.md

Responda e escreva sempre em português.

## Atualização prioritária — 07/11/2026 (IoT e plateia ao vivo)

**Antes de editar IoT, UX, SSE, QR, Compose ou publicar**, leia `@docs/entrega/PLATEIA_QR_HANDOFF.md` e `@docs/CONTRATO_IOT.md`.

- Novos fluxos: `/plateia` (público, somente leitura), `/api/plateia/stream` (SSE com whitelist), `/convite` (QR no BI protegido), tiles MQTT DHT11/HX711 no BI.
- O HX711 disponível suporta 5 kg nominais; limiar **de negócio** padrão 1,5 kg por 6 s após aferição. Jamais confundir com capacidade do hardware.
- **Nunca** abrir `/api/live/stream`, APIs administrativas ou o BI sem autenticação; não enviar eventos internos brutos à plateia.
- **Não** mesclar `develop` em `main` sem typecheck, lint, testes, validação física e carga real de 70 conexões; VPS publica `main` sem auto deploy.
- Registre resultados com PASSOU/FALHOU/NÃO EXECUTADO, sem inventar logs.
