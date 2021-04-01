FROM node:14

WORKDIR /app

VOLUME /data

COPY package*.json ./

RUN npm install

COPY . ./

COPY .env ./

CMD ["node", "app.js"]