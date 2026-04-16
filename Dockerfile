FROM node:22 AS builder

WORKDIR /app
ENV PNPM_HOME="/usr/local/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install
COPY . .
RUN pnpm run build

FROM node:22

WORKDIR /app
ENV PNPM_HOME="/usr/local/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && pnpm add -g pm2@6

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN HUSKY=0 pnpm install --prod
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["pm2-runtime", "dist/main.js"]
