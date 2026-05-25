FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY index.html styles.css app.js server.js ./
COPY assets ./assets

ENV NODE_ENV=production
ENV DATA_DIR=/data

EXPOSE 10000

CMD ["node", "server.js"]
