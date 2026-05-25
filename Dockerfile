FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY index.html styles.css app.js server.js ./
COPY assets ./assets

ENV NODE_ENV=production
ENV PORT=5173
ENV DATA_DIR=/data

EXPOSE 5173

CMD ["node", "server.js"]
