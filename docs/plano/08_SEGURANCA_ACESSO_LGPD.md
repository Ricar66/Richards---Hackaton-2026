# Segurança, autorização, privacidade e auditabilidade

## Princípio
Protótipo de bancada ≠ produção. Pode usar autenticação Basic do starter **apenas em ambiente de teste isolado**. Para exposição externa, autenticação de sessão robusta, autorização por organização/role, HTTPS, rate limit, backups, logs e revisão de privacidade.

## Acesso e matriz
| Ação | OWNER | OPERATOR | ANALYST | RECIPIENT | DEVICE |
|---|---|---|---|---|---|
| Visualizar BI da organização | Sim | Sim | Sim | Não | Não |
| Registrar/resolver ocorrência | Sim | Sim | Não | Não | Não |
| Configurar dispositivo/limiares | Sim | Apenas delegado | Não | Não | Não |
| Cadastrar excedente | Sim | Sim | Não | Não | Não |
| Marcar verificação sanitária | Somente responsável habilitado autorizado | Somente responsável habilitado autorizado | Não | Não | Não |
| Reservar/confirmar recebimento | Sob regras do negócio | Sob regras do negócio | Não | Apenas lotes atribuídos | Não |
| Exportar PDF interno | Sim | Sim | Sim | Limitado | Não |
| Enviar telemetria | Não | Não | Não | Não | Somente sua placa |

**Observação:** o schema atual tem `Role` mas não implementa autorização completa por papel. Não assumir proteção pronta.

## Checklist concreto
- Nunca confiar em `orgId` vindo da URL para acesso; derivar da sessão e verificar site/device.
- Chaves de dispositivo só no ESP32/servidor, nunca em `NEXT_PUBLIC_*`, commit, print ou tooltip.
- Armazenar hash e comparar com `timingSafeEqual`, após checar formato para evitar exceptions.
- Validar tamanho do JSON, tipos, timezone, intervalos de timestamp e frequência da telemetria.
- Rate-limit por dispositivo/IP na borda de implantação; não armazenar credenciais em logs.
- Ativar HSTS/TLS quando exposto; no laboratório usar Wi-Fi isolado.
- Política de retenção e minimização de dados: não coletar geolocalização nem detalhes pessoais desnecessários.
- Dados de entidades receptoras usados só na operação; não publicar nome de pessoa física sem necessidade.
- Backup e teste de restauração antes de versão comercial; dados do hackathon podem ser demo.
- AuditEvent persistido na mesma transação da mudança de status, sempre que possível.
- PDFs exigem autorização e não devem vazar dados de outra organização.
- Certificar que a rota de simulação só funciona com `DEMO_MODE=true` e auth de operador.

## Gaps concretos da V3
1. `proxy.ts` com Basic Auth é somente bancada e permite tráfego sem auth quando `AUTH_MODE != basic`. Não publicar em internet assim.
2. `DEMO_ORG_ID` fixo em serviços não implementa multi-tenant real.
3. `isDemo` pode devolver fallback de analytics mesmo quando o banco falhou; mostrar `SIMULATED` e erro claro, não como realidade.
4. `x-richards-simulator` só pode atribuir origem `SIMULATED` em ambiente DEMO controlado.
5. Validação de papel no fluxo de verificação sanitária precisa ser definida antes de operação real.

## Requisitos legais/sanitários
Toda doação deve obedecer à legislação sanitária aplicável. A plataforma documenta a verificação; não determina automaticamente se um alimento está apto. A lei federal de combate ao desperdício alimentar e regras específicas de manipulação/transporte podem se aplicar; validar com mentor sanitário/jurídico conforme piloto.
