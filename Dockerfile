FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY server.mjs site-core.js ./

ENV NODE_ENV=production
ENV PORT=8787
ENV DATA_DIR=/data

RUN mkdir -p /data

EXPOSE 8787

CMD ["node", "server.mjs"]
