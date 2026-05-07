FROM node:20-bookworm-slim AS build
WORKDIR /app

# better-sqlite3 needs build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
COPY public ./public
RUN npm run build

# Strip dev deps
RUN npm prune --omit=dev


FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000

RUN mkdir -p /data && chown -R node:node /data

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/package.json ./package.json

USER node
EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "dist/server.js"]
