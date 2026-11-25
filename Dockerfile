FROM node:24-bookworm-slim AS workspaces
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY shared/package.json ./shared/
RUN npm ci --no-audit --no-fund

FROM workspaces AS api
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
COPY backend ./backend
RUN npm run db:generate && npm run build -w @codeclub/backend
WORKDIR /app/backend
USER node
EXPOSE 5010
CMD ["node", "dist/index.js"]

FROM workspaces AS frontend-build
COPY frontend ./frontend
COPY shared ./shared
RUN npm run build -w @codeclub/frontend

FROM nginx:1.28-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html
EXPOSE 3010
