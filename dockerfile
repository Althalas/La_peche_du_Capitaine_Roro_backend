FROM node:20-alpine

RUN apk update && apk upgrade

WORKDIR /usr/src/app


COPY package*.json ./


RUN npm install --omit=dev


COPY . .


EXPOSE 3001

CMD [ "node", "server.js" ]