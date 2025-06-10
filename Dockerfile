FROM ghcr.io/import-ai/omnibox-backend-runtime:latest AS builder

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install
COPY . .
RUN pnpm run build

FROM ghcr.io/import-ai/omnibox-backend-runtime:latest

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["pm2-runtime", "dist/main.js"]
