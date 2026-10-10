# Agapay clickable prototype — static SPA served by nginx.
# Build context = repo root (Dokploy default); app lives in app/.

FROM node:24-alpine AS build
WORKDIR /build
RUN corepack enable && corepack prepare pnpm@10.23.0 --activate
COPY app/package.json app/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY app/ ./

# Vite inlines VITE_* at BUILD time, so these must arrive as build args.
# Dokploy passes the app's Environment entries through as --build-arg.
# Omit them (or leave VITE_DEMO_MODE unset) and the image builds the seeded
# demo — which is exactly what the public prototype should serve.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_DEMO_MODE
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_DEMO_MODE=$VITE_DEMO_MODE

RUN pnpm build

FROM nginx:1.29-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /build/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO/dev/null http://127.0.0.1/ || exit 1
