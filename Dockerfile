# Agapay clickable prototype — static SPA served by nginx.
# Build context = repo root (Dokploy default); app lives in app/.

FROM node:24-alpine AS build
WORKDIR /build
RUN corepack enable && corepack prepare pnpm@10.23.0 --activate
COPY app/package.json app/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY app/ ./
RUN pnpm build

FROM nginx:1.29-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /build/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO/dev/null http://127.0.0.1/ || exit 1
