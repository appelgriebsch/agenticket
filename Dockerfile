# syntax=docker/dockerfile:1

# ---- build stage: dev deps + tsdown bundle ----
FROM oven/bun:1-slim AS build
WORKDIR /app
COPY package.json ./
# --ignore-scripts mirrors real bunx: better-sqlite3's postinstall (node-gyp)
# never runs under Bun and isn't needed — the container uses bun:sqlite.
RUN bun install --ignore-scripts
COPY tsconfig.json tsdown.config.ts ./
COPY src ./src
RUN bun run build

# ---- runtime stage: prod deps only + dist ----
FROM oven/bun:1-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN bun install --production --ignore-scripts && rm -rf /root/.bun/install/cache
COPY --from=build /app/dist ./dist
COPY bin ./bin

ENV AGENTICKET_DATA_DIR=/data \
    AGENTICKET_HOST=0.0.0.0
VOLUME /data
EXPOSE 3547

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD bun -e "fetch(\`http://127.0.0.1:\${process.env.AGENTICKET_PORT ?? 3547}/healthz\`).then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["bun", "bin/agenticket.js", "start", "--foreground"]
