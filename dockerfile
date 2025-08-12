FROM node:20-alpine3.19


WORKDIR /usr/src/app


COPY package*.json ./


RUN npm install --omit=dev && npm audit fix --force


COPY . .


EXPOSE 3001

CMD [ "node", "server.js" ]