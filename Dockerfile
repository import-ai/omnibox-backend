FROM node:20

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install pm2@latest @nestjs/cli -g
RUN npm install

COPY . .

RUN npm run build

EXPOSE 9005

CMD ["pm2-runtime", "dist/main.js"]