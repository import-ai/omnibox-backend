FROM node:22

WORKDIR /app
ENV PNPM_HOME="/usr/local/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm add -g pm2@6
RUN HUSKY=0 pnpm install --prod
