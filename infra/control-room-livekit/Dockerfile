FROM livekit/livekit-server:latest AS livekit

FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash ca-certificates haproxy iptables \
    && rm -rf /var/lib/apt/lists/*

COPY --from=livekit /livekit-server /usr/local/bin/livekit-server

WORKDIR /app
COPY . .
RUN npm install

# Next.js basePath and NEXT_PUBLIC_* values are compiled into browser bundles.
# Railway exposes service variables to Docker builds only when they are declared as ARG.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}
ENV PRISM_PREVIEW_GATEWAY=1

RUN npm run build -w @ips/director && npm run build -w @ips/editor && npm run build -w @ips/replay

RUN chmod +x /app/scripts/start-control-room-livekit.sh

EXPOSE 8080
EXPOSE 7882

CMD ["bash","/app/scripts/start-control-room-livekit.sh"]
