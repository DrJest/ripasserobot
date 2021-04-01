FROM node:14

WORKDIR /app

VOLUME /data

COPY package*.json ./

RUN npm install

COPY . ./

CMD ["node", "app.js"]