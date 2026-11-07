# RICHARDS Assist — implementação e ativação

**Estado:** funcionalidade opcional para revisão em PR contra `develop`. Nenhuma alteração/deploy em `main` ou VPS. OpenAI e Telegram reais ainda precisam de validação com credenciais locais; testes automatizados usam transportes controlados. Não atribuir validação física ao assistente.

## Entrega

- `/assistente`: conversa no BI autenticado, sugestões, fontes consultadas e horário da resposta, vinculação Telegram, preferências e diagnóstico de fila/worker.
- OpenAI Responses por HTTP nativo, modelo configurável, `store:false`, até 3 chamadas por pergunta, no máximo 6 ferramentas executadas. Nenhuma dependência adicionada ao produto.
- Ferramentas somente leitura: resumo do BI com período/origem, até 30 ocorrências ativas, evidência de ocorrência conhecida e guia versionado do produto. Não há SQL, shell, navegação ou URL arbitrária escolhidos pelo modelo.
- Telegram privado: código de 192 bits, hash no banco, uso único e expiração de 10 minutos. Só operador autenticado gera vínculo; o chat precisa iniciar o bot. Grupos e remetentes diferentes do chat são ignorados.
- Worker contínuo independente do navegador: fila persistida PostgreSQL, varredura de eventos, lembrete de ocorrência ainda OPEN, offline após 120 s sem contato e resumo diário opcional por origem.
- Alertas são templates determinísticos sobre registros do banco; não dependem da OpenAI nem geram novas ocorrências por conta própria.
- Desativado por padrão. As rotas não foram liberadas para a plateia e `AUTH_MODE=none` não libera IA paga/vinculação.

## O que Ricardo precisa fazer

1. Criar um bot em `@BotFather` (`/newbot`) e guardar token e username, sem `@`. Não enviar a chave/token em chat, issue, PR, vídeo ou Git.
2. Separar uma API key de projeto OpenAI com crédito disponível. Configurar alertas/limites no painel do provedor. A assinatura ChatGPT não substitui o faturamento da API.
3. Depois da revisão do PR, preencher somente no `.env` local ou no ambiente secreto da homologação:

```dotenv
ASSISTANT_ENABLED="true"
OPENAI_API_KEY="PREENCHER_SOMENTE_NO_AMBIENTE"
OPENAI_MODEL="gpt-4.1-mini"
ASSISTANT_DAILY_REQUEST_LIMIT="200"
ASSISTANT_MINUTE_REQUEST_LIMIT="6"
TELEGRAM_ENABLED="true"
TELEGRAM_BOT_TOKEN="PREENCHER_SOMENTE_NO_AMBIENTE"
TELEGRAM_BOT_USERNAME="USERNAME_SEM_ARROBA"
ASSISTANT_BASE_URL="https://HOST_DO_BI"
ASSISTANT_ESCALATION_MINUTES="15"
ASSISTANT_SUMMARY_HOUR="8"
```

4. Usar HTTPS para o acesso autenticado antes de ativar no público. A VPS atual por HTTP continua com o risco já documentado; este PR não altera essa infraestrutura. O endereço de link deve funcionar no celular, sem credenciais na URL.
5. Em homologação, fazer backup e aplicar somente migrations versionadas: `pnpm db:deploy`. A nova migration cria seis tabelas/índices/relacionamentos aditivos. Não executar reset, force-reset ou limpeza de banco.
6. Subir a aplicação e, em processo separado, `pnpm assistente` (ou `node --import tsx src/assistant/run-assistant.ts`). Deixar os dois processos supervisionados para operação contínua.
7. Abrir `/assistente`, clicar **Conectar meu Telegram**, abrir o link e tocar **Iniciar**. Voltar ao painel e conferir vínculo/status. Ativar simulação e resumo somente se desejar. Pode desfazer em **Desconectar** ou `/parar`.

Para Docker LOCAL/homologação existe o override opcional:

```bash
docker compose -f docker-compose.yml -f compose.assistant.yml --profile assistente up -d --build
```

O override injeta variáveis de servidor no web e acrescenta worker com healthcheck. Ele não é adaptação automática de `docker-compose.vps.yml`: Claude precisa revisar a configuração da VPS e aguardar autorização antes de implantar. Não expõe novas portas.

## Comandos do Telegram

| Comando | Resultado |
|---|---|
| `/status` | Último contato dos dispositivos cadastrados; não certifica a medição |
| `/resumo` | Últimas 24 h por DEVICE e MANUAL; SIMULATED somente com opção ativada |
| `/ajuda` | Comandos e limites |
| `/limpar` | Limpa contexto da conversa, preservando registros operacionais |
| `/parar` ou `/stop` | Desativa assinatura/conversa e cancela entregas pendentes |
| Texto livre | Consulta assistente com ferramentas de leitura, sujeito a limite |

Assumir/resolver ocorrências e confirmar entregas continuam no BI; o bot não dispõe de ferramenta de escrita. O botão dos alertas abre o BI autenticado. Não criar conta/login de instituição inexistente nem dar acesso administrativo a quem escaneia o QR público.

## Garantias e limites reais

- A fila usa chave única de evento/assinatura, `FOR UPDATE SKIP LOCKED`, leases e atualizações condicionadas pelo token de lease. Falha de Telegram retenta com backoff e respeita `retry_after`. Após 8 tentativas, fica DEAD e aparece no painel.
- É entrega **pelo menos uma vez**: se o Telegram aceitar e o processo cair antes de registrar SENT, a retentativa pode repetir a mensagem. A Bot API não oferece chave de idempotência para este envio. Não prometer entrega exatamente uma vez ou leitura pelo destinatário.
- Varredura sobre eventos persistidos após o vínculo recupera lacunas de reinício, sem depender de notificações efêmeras. Até 100 eventos por assinatura/ciclo e 100 assinaturas ativas por ciclo nesta versão. Escala maior requer paginação e teste de carga.
- A primeira vinculação inicia nos eventos futuros. Reativar define um novo marco. Ao habilitar simulação, eventos simulados ainda não enviados desde esse marco podem ser recuperados.
- Offline não comprova desligamento do hardware. A origem da última leitura simulada é carimbada; não inferimos origem física só pelo cadastro. Nunca avisar um dispositivo NEVER_SEEN como se tivesse caído.
- Lembrete atrasado é descartado se a ocorrência já foi assumida/resolvida. Alerta de offline é descartado se houve novo contato. Mensagens de eventos preservam o instante original e pedem consulta ao estado atual no BI.
- Um advisory lock de sessão mantém um poller por banco. Um bot dedicado não deve ter webhook ativo nem outro `getUpdates` rodando: conflito 409 encerra o worker e requer correção no ambiente. Não apagar webhook automaticamente.
- Offset do Telegram avança somente após persistir o inbox. Retentativa do envio de resposta reaproveita texto salvo, evitando chamar a IA de novo por uma falha de envio. Ações de vínculo/comandos são idempotentes quando possível; queda entre consumo do código e gravação da resposta pode exigir gerar novo link.
- As cotas persistidas limitam tentativas por minuto/ator e por dia UTC/workspace. Cada pergunta pode fazer até 3 chamadas OpenAI. Isso não é um teto financeiro exato: custo depende do modelo e do conteúdo. Falhas também consomem tentativa local.
- A chave nunca é enviada ao cliente. Notas, autores completos, recebedores e verificadores não compõem os DTOs de ferramentas. Redação de padrões de credencial é uma proteção auxiliar, não detector universal de PII. A OpenAI recebe a pergunta, contexto limitado e resultados autorizados; `store:false` não equivale a uma promessa de retenção zero universal do provedor.
- Contexto web fica na aba. Telegram guarda até 6 mensagens no banco e só usa esse contexto por uma hora; os dados persistidos permanecem até `/limpar`, desvinculação ou próxima conversa que substitua o contexto. Inbox guarda resposta para retentativa; política de retenção/arquivamento antes de uso prolongado é P1.
- A IA pode errar. Fontes na UI significam consultas executadas, não validação matemática automática da resposta. Necessário ensaio de perguntas reais antes do palco.
- Falha de internet, banco ou servidor interrompe o serviço. Healthcheck só mede contato recente do worker com o banco, não entrega/visualização no celular. Monitoramento externo da infraestrutura é necessário para detectar a queda do próprio host.

## Referências técnicas

- https://developers.openai.com/api/docs/guides/function-calling
- https://developers.openai.com/api/docs/guides/conversation-state
- https://developers.openai.com/api/docs/models/gpt-4.1-mini
- https://core.telegram.org/bots/api

As APIs externas não foram chamadas com credenciais reais nesta implementação. Credenciais e configuração final pertencem ao responsável pelo ambiente.

## Desativar com segurança

Desligar `ASSISTANT_ENABLED` desabilita novas consultas pagas; `TELEGRAM_ENABLED=false` impede iniciar o worker. Para parar um worker já em execução, pare o serviço/processo; as flags são lidas na partida. Não limpar a fila nem o banco. Desconectar a assinatura cancela os pendentes; uma mensagem já em envio pode ainda chegar. A migração é aditiva e pode permanecer aplicada com o recurso desligado.
