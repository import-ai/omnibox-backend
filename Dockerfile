FROM node:22 AS builder

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22

WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
COPY --from=builder /usr/src/app/dist ./dist
RUN npm install pm2@latest -g

EXPOSE 3000
CMD ["pm2-runtime", "dist/main.js"]
