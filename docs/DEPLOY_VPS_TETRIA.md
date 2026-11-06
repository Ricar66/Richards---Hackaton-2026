# Publicação do RICHARDS na VPS da Tétria

> Preparado em 06/11/2026, de madrugada, a partir de como a **Elora** (projeto CardCraft, `E:\CraftOps\apps\web\CardCraft\docs\06-operacao\`) está publicada.
> **Nada foi executado na VPS, no Coolify nem na Cloudflare.**
> O repositório já tem o `docker-compose.vps.yml`, validado localmente.

## Por que não foi publicado sozinho

- A governança da Tétria (`tetriaOS/Operations/GOVERNANCA.md`, linhas 39–55) manda **parar e pedir orientação aos sócios** antes de publicar produto, alterar produção ou mexer em infraestrutura. Para isso não há aprovador definido.
- O Cloudflare Access e a rota do túnel ficam na conta Zero Trust administrada pelo Haroldo.
- A mesma VPS roda a **produção da Elora**, com domínios de clientes. Um erro na regra final do túnel derruba esses domínios.

## Decisões recomendadas

| # | Decisão | Recomendação |
|---|---|---|
| D1 | Papel da VPS no evento | **Vitrine**. O palco continua no notebook (`docker compose up -d`, testado) |
| D2 | Banco | **Novo**, com o seed SIMULATED. A fala cita os números de **uma** fonte só |
| D3 | Expor sem Access | **Não.** O app tem senha única de laboratório e `DEMO_MODE=true` (regra 8) |
| D4 | Quem entra | Só os e-mails da equipe (Access com One-time PIN, sessão de 24 h) |
| D5 | Senhas | Novas, geradas na VPS com `openssl rand -hex 32`, guardadas no Passbolt e trocadas na desmontagem |
| D6 | Hostname | `richards.tetriabrasil.com.br`, com um nível só, coberto pelo certificado curinga |
| D7 | IoT na VPS | **Não no evento.** O firmware HTTP não tem TLS; a bancada fica local |
| D8 | Prazo | Desmontar até 08/11 |

## Arquitetura

```
navegador (allowlist) ─HTTPS─► Cloudflare: DNS proxied + Access (Allow, sem Bypass) + túnel "tetria"
                                   │ rota richards.tetriabrasil.com.br → http://127.0.0.1:18082
VPS ── cloudflared ──► 127.0.0.1:18082 ──► web (Next, :3000) ──► richards-db (Postgres 16, sem porta no host)
       (Coolify: projeto RICHARDS · ambiente demo · recurso richards-demo · compose /docker-compose.vps.yml)
       vizinhos intocados: Elora 18081 + regra final do túnel, Keycloak 18080, Coolify 8000/6001/6002, Traefik 443
```

## Passo a passo

### 0. Autorização

1. Pedido aos sócios (Haroldo, Marcus, Paulo e Ricardo). O texto pronto está no fim deste arquivo.
2. Decisão registrada em `tetriaOS/Operations/Decisões/`, com hostname, prazo, "só Access, sem Bypass" e quem opera.

### 1. Repositório (Ricardo)

3. Congelar a versão do evento: `git tag deploy-hackathon-2026` (ou uma branch `deploy/vps-hackathon`). Durante o evento, a VPS **não** segue o `main`.

### 2. Coolify (Ricardo)

4. **Novo projeto `RICHARDS`**, ambiente `demo`, recurso `richards-demo`:
   - **Tipo:** Docker Compose (Git). Não usar "Service" colado.
   - **Repositório:** `https://github.com/Ricar66/Richards---Hackaton-2026` (público), na tag ou branch congelada.
   - **Compose:** `/docker-compose.vps.yml`.
   - **Domínio:** vazio em todos os serviços. Apagar qualquer `*.sslip.io` sugerido.
   - **Desligados:** Auto deploy, "Inject Build Args to Dockerfile" e "Connect to Predefined Network".
5. **Conferir ao vivo** que a porta está livre (SSH): `ss -ltnp | grep 18082` não deve devolver nada.
6. **Variáveis do recurso** (nenhuma como Build Variable):
   - `VPS_POSTGRES_PASSWORD`: definir antes do 1º deploy, porque o Postgres só aplica a senha ao criar o volume;
   - `VPS_OPERATOR_USER` e `VPS_OPERATOR_PASSWORD`;
   - `VPS_IOT_DEVICE_KEY`.

### 3. Cloudflare (Haroldo ou o administrador da zona)

7. **Access antes da rota:**
   - aplicação self-hosted para `richards.tetriabrasil.com.br` (domínio inteiro);
   - política **Allow** com e-mails exatos, One-time PIN e sessão de 24 h;
   - **sem Bypass e sem exceção de caminho**.
8. **Túnel `tetria`:**
   - rota pública `richards.tetriabrasil.com.br` → `http://127.0.0.1:18082`;
   - sem `httpHostHeader`, que quebra a proteção CSRF de `src/proxy.ts`;
   - **sem tocar na regra final**, que é da Elora.
   - O CNAME precisa ser proxied, nunca um registro A para o IP da VPS.
9. **http → https só para esse hostname**, com uma Redirect Rule filtrada. Não mexer no "Always Use HTTPS" da zona. A senha Basic nunca pode trafegar em http.

### 4. Deploy

10. Deploy manual. Nos logs, esperar `migrate deploy` (3 migrations) → seed → `next start`. O status precisa ficar **Healthy**.
11. Resolver pelo BI a ocorrência do seed `richards-oc-01`, senão a regra 5 bloqueia o alerta ao vivo.
12. Rodar o checklist abaixo.
13. Manter o auto deploy **desligado** até o fim do evento.

## Tempo real (SSE) atrás da Cloudflare

A versão de 06/11 traz `/api/live/stream` (Server-Sent Events):

- **Compressão:** a rota manda `Cache-Control: no-cache, no-transform`, o que impede a compressão de segurar os eventos.
- **Ociosidade:** o heartbeat de 15 s fica bem abaixo do corte de ociosidade de 100 s do proxy da Cloudflare.
- **Sessão do Access:** se ela expirar no meio da apresentação, o stream e a consulta de reserva caem para o login. A tela passa a mostrar "Servidor indisponível · números parados". Mitigação: fazer login menos de 1 h antes, com a aba já aberta.

## Checklist pós-deploy

Registrar cada item como PASSOU, FALHOU ou NÃO EXECUTADO.

| # | Verificação | Esperado |
|---|---|---|
| 1 | Status no Coolify | `web` e `richards-db` Healthy |
| 2 | `ss -ltnp \| grep -E '18082\|5432'` | Só `127.0.0.1:18082` |
| 3 | De fora (rede móvel): `curl -m 5 http://<IP_VPS>:18082/` | Recusado ou timeout |
| 4 | `curl -sSI https://richards.tetriabrasil.com.br/api/health`, sem sessão | 302 para `*.cloudflareaccess.com` |
| 5 | `curl -sSI http://richards.tetriabrasil.com.br/` | Redireciona para https ou para o Access, nunca 401 do app em http |
| 6 | Domínios no Coolify | Nenhum, nem `sslip` |
| 7 | Navegador da allowlist | Access → Basic Auth → BI. `/api/health` com `"database":"up"` |
| 8 | E-mail fora da allowlist | Bloqueado |
| 9 | `/ao-vivo` aberto | Estado "Ao vivo"; um "Simular alerta" no BI aparece na Sala em menos de 2 s |
| 10 | PDF em `/relatorios` | Carimbo SIMULATED e os mesmos números do BI |
| 11 | Reiniciar o `web` | Volta Healthy e os dados continuam (volume preservado) |
| 12 | Vizinhos | `https://elora.tetriabrasil.com.br/api/health` OK, e um domínio próprio de cliente ainda abre |

## Desmontagem (até 08/11)

- Remover a rota do túnel, a aplicação do Access e o CNAME.
- Parar o recurso e trocar as senhas.
- Apagar o volume **só com autorização expressa** (regra 9).

## Pedido aos sócios (texto pronto)

> **Pedido de aprovação: demonstração do RICHARDS na VPS da Tétria (Hackathon Senac, 06–08/11)**
>
> Quero publicar a demonstração do RICHARDS Intelligence, projeto do hackathon, em `richards.tetriabrasil.com.br`, até 08/11. Nessa data desmonto tudo.
>
> - **Acesso:** só pela Cloudflare Access, com os e-mails da equipe, sem Bypass. A aplicação fica na porta local 18082 e não toca na Elora, nem na porta 18081, nem na regra final do túnel.
> - **Dados:** banco próprio, novo e só com dados simulados e carimbados. Sem dados de clientes da Tétria.
> - **Operação:** recurso próprio no Coolify (projeto RICHARDS), com auto deploy desligado. O build fica fora do horário de uso da Elora.
> - **Preciso do Haroldo para:** criar o Access e a rota no túnel `tetria`.
>
> O roteiro, o checklist e a desmontagem estão em `docs/DEPLOY_VPS_TETRIA.md` do repositório.
