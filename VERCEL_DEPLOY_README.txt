IPS PROJECT 5.2 — VERCEL READY

Deployment source: GitHub main branch.
Vercel project: ips-italy-point-system-controller.
Root Directory: repository root (./).
Build command: npm run build -w @ips/web
Output Directory: apps/web/.next

Required Vercel environment variables:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- NEXT_PUBLIC_PHONE_AUTH_ENABLED=false

This file is intentionally non-secret. No service-role key belongs in GitHub.

Deployment trigger: production environment variables configured in Vercel on 2026-09-22.
