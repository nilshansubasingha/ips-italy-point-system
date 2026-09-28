#!/bin/bash
set -euo pipefail

TCP_PROXY_DOMAIN="${RAILWAY_TCP_PROXY_DOMAIN:-}"
TCP_PROXY_PORT="${RAILWAY_TCP_PROXY_PORT:-}"
TCP_APP_PORT="${RAILWAY_TCP_APPLICATION_PORT:-}"
ICE_TCP_PORT="7881"
NODE_IP=""

if [ -n "$TCP_PROXY_PORT" ] && [ -n "$TCP_PROXY_DOMAIN" ] && [ -n "$TCP_APP_PORT" ]; then
  echo "LiveKit TCP proxy: ${TCP_PROXY_DOMAIN}:${TCP_PROXY_PORT} -> container:${TCP_APP_PORT}"
  ICE_TCP_PORT="$TCP_PROXY_PORT"

  RESOLVED_IP=$(getent ahostsv4 "$TCP_PROXY_DOMAIN" 2>/dev/null | awk 'NR==1 {print $1}' || true)
  if [ -z "$RESOLVED_IP" ]; then
    RESOLVED_IP=$(getent hosts "$TCP_PROXY_DOMAIN" 2>/dev/null | awk '{print $1}' | head -1 || true)
  fi
  NODE_IP="$RESOLVED_IP"

  if [ "$TCP_APP_PORT" != "$ICE_TCP_PORT" ]; then
    if iptables -t nat -A PREROUTING -p tcp --dport "${TCP_APP_PORT}" -j REDIRECT --to-port "${ICE_TCP_PORT}" 2>/dev/null; then
      echo "LiveKit ICE redirect configured with iptables"
    else
      cat >/tmp/ips-livekit-haproxy.cfg <<HACFG
global
  log stdout format raw local0 info
defaults
  mode tcp
  timeout connect 8s
  timeout client 600s
  timeout server 600s
  log global
listen livekit_ice
  bind 0.0.0.0:${TCP_APP_PORT}
  server livekit 127.0.0.1:${ICE_TCP_PORT}
HACFG
      haproxy -f /tmp/ips-livekit-haproxy.cfg -D
      echo "LiveKit ICE forwarding configured with haproxy"
    fi
  fi
else
  echo "WARNING: no Railway TCP proxy configured yet; remote LiveKit media will not be reachable."
fi

cat >/tmp/ips-livekit.yaml <<EOF
port: 7880
bind_addresses:
  - "0.0.0.0"
log_level: info

rtc:
  tcp_port: ${ICE_TCP_PORT}
  port_range_start: 0
  port_range_end: 0
  force_tcp: true
  use_external_ip: false
  use_ice_lite: false
  enable_loopback_candidate: false

keys:
  ${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}

room:
  auto_create: true

turn:
  enabled: false
EOF

if [ -n "$NODE_IP" ]; then
  livekit-server --config /tmp/ips-livekit.yaml --node-ip "$NODE_IP" &
else
  livekit-server --config /tmp/ips-livekit.yaml &
fi
LIVEKIT_PID=$!

cleanup(){
  kill "$LIVEKIT_PID" 2>/dev/null || true
}
trap cleanup EXIT TERM INT

export PRISM_PREVIEW_GATEWAY=1
exec node scripts/prism-preview-gateway.mjs
