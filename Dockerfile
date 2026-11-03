FROM node:22-alpine
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# Build de produção: o servidor de desenvolvimento bloqueia acesso por IP (127.0.0.1/LAN) e recompila sob demanda.
# Para codar com hot reload, use `pnpm dev` fora do container.
RUN pnpm build
EXPOSE 3000
# migrate deploy só aplica migrations versionadas pendentes; nunca reseta nem apaga dados.
CMD ["sh", "-c", "pnpm db:deploy && pnpm db:seed && pnpm start"]
