FROM ghcr.io/import-ai/omnibox-backend-runtime:latest AS builder

WORKDIR /app
COPY . .
RUN pnpm run build

FROM ghcr.io/import-ai/omnibox-backend-runtime:latest

WORKDIR /app
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["pm2-runtime", "dist/main.js"]
