# Image unique pour l'API (qui sert aussi l'interface compilée) et le worker.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY worker/package.json worker/
COPY frontend/package.json frontend/
RUN npm ci
COPY . .
RUN npm run build -w frontend

FROM node:22-bookworm-slim
ENV NODE_ENV=production SERVE_FRONTEND=true API_HOST=0.0.0.0 API_PORT=3000
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
RUN mkdir -p /app/storage/media && chown -R node:node /app/storage
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "npx tsx backend/src/scripts/migrate.ts && npx tsx backend/src/scripts/seed.ts && npx tsx backend/src/server.ts"]
