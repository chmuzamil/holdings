# Holdings with its optional server: one container, one SQLite file in /data.
# See docs/self-hosting.md.

# The build output is plain JavaScript and static files, so it is built once
# on the build machine and copied into each platform's image.
FROM --platform=$BUILDPLATFORM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/mcp/package.json packages/mcp/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm run build:server

# The server bundle only uses Node's built-in modules, so no node_modules here.
FROM node:24-slim
ENV NODE_ENV=production \
    HOLDINGS_HOST=0.0.0.0 \
    HOLDINGS_PORT=8080 \
    HOLDINGS_DATA_DIR=/data \
    HOLDINGS_STATIC_DIR=/app/dist
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/packages/server/dist/server.js ./server.js
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/api/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server.js"]
