FROM node:22-bookworm-slim

WORKDIR /app
COPY . .
RUN npm install

# Next.js basePath and NEXT_PUBLIC_* values are compiled into browser bundles.
# Railway exposes service variables to Docker builds only when declared as ARG.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_IPS_OVERLAY_URL
ARG NEXT_PUBLIC_IPS_REPLAY_URL
ARG NEXT_PUBLIC_IPS_WEB_URL
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}
ENV NEXT_PUBLIC_IPS_OVERLAY_URL=${NEXT_PUBLIC_IPS_OVERLAY_URL}
ENV NEXT_PUBLIC_IPS_REPLAY_URL=${NEXT_PUBLIC_IPS_REPLAY_URL}
ENV NEXT_PUBLIC_IPS_WEB_URL=${NEXT_PUBLIC_IPS_WEB_URL}
ENV PRISM_PREVIEW_GATEWAY=1

RUN npm run build -w @ips/controller && npm run build -w @ips/director && npm run build -w @ips/editor && npm run build -w @ips/replay && npm run build -w @ips/overlay

EXPOSE 8080

CMD ["node","scripts/prism-preview-gateway.mjs"]
