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
ENV PORT=1998

RUN mkdir -p /data

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json

# Run as root so bind-mounted /data is writable regardless of host UID/GID.
# This is the standard pattern for self-hosted apps (Tautulli, Sonarr, etc.).
EXPOSE 1998
VOLUME ["/data"]

CMD ["node", "dist/server.js"]
