#!/bin/bash
set -euo pipefail

TCP_PROXY_DOMAIN="${RAILWAY_TCP_PROXY_DOMAIN:-}"
TCP_PROXY_PORT="${RAILWAY_TCP_PROXY_PORT:-}"
TCP_APP_PORT="${RAILWAY_TCP_APPLICATION_PORT:-}"
ICE_TCP_PORT="7881"
NODE_IP=""

if [ -n "$TCP_PROXY_PORT" ] && [ -n "$TCP_PROXY_DOMAIN" ] && [ -n "$TCP_APP_PORT" ]; then
  echo "Railway TCP proxy: ${TCP_PROXY_DOMAIN}:${TCP_PROXY_PORT} -> container:${TCP_APP_PORT}"
  ICE_TCP_PORT="$TCP_PROXY_PORT"

  RESOLVED_IP=$(getent ahostsv4 "$TCP_PROXY_DOMAIN" 2>/dev/null | awk 'NR==1 {print $1}' || true)
  if [ -z "$RESOLVED_IP" ]; then
    RESOLVED_IP=$(getent hosts "$TCP_PROXY_DOMAIN" 2>/dev/null | awk '{print $1}' | head -1 || true)
  fi
  NODE_IP="$RESOLVED_IP"

  if [ "$TCP_APP_PORT" != "$ICE_TCP_PORT" ]; then
    echo "Forwarding container:${TCP_APP_PORT} -> LiveKit:${ICE_TCP_PORT}"
    if iptables -t nat -A PREROUTING -p tcp --dport "${TCP_APP_PORT}" -j REDIRECT --to-port "${ICE_TCP_PORT}" 2>/dev/null; then
      echo "iptables redirect configured"
    else
      cat >/tmp/haproxy.cfg <<HACFG
global
  log stdout format raw local0 info
defaults
  mode tcp
  timeout connect 8s
  timeout client 600s
  timeout server 600s
  log global
listen ice_forwarder
  bind 0.0.0.0:${TCP_APP_PORT}
  server livekit 127.0.0.1:${ICE_TCP_PORT}
HACFG
      haproxy -f /tmp/haproxy.cfg -D
      echo "haproxy fallback started"
    fi
  fi
else
  echo "WARNING: Railway TCP proxy variables are missing; ICE/TCP will use 7881 directly."
fi

SIGNAL_PORT="${PORT:-8080}"

cat >/etc/livekit.yaml <<EOF
port: ${SIGNAL_PORT}
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

echo "=== IPS LiveKit SFU ==="
echo "Signaling port: ${SIGNAL_PORT}"
echo "ICE TCP port: ${ICE_TCP_PORT}"
echo "Advertised node IP: ${NODE_IP:-none}"

if [ -n "$NODE_IP" ]; then
  exec livekit-server --config /etc/livekit.yaml --node-ip "$NODE_IP"
else
  exec livekit-server --config /etc/livekit.yaml
fi
