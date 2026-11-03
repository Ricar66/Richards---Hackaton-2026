FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json ./
RUN pnpm install --no-frozen-lockfile
COPY . .
RUN pnpm db:generate
EXPOSE 3000
CMD ["sh", "-c", "pnpm db:push && pnpm db:seed && pnpm dev"]
