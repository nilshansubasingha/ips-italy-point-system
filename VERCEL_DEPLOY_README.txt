IPS PROJECT 5.2 — VERCEL READY

1. Open PowerShell in this folder.
2. Run:
   powershell -ExecutionPolicy Bypass -File .\deploy-vercel.ps1
3. If Vercel CLI asks you to log in, complete the one-time browser/device authorization.
4. The script creates/links a dedicated project named: ips-italy-point-system
5. It deploys the public IPS web app to production.

The Supabase URL and publishable browser key are already included in apps/web/.env.production.
No service-role/secret key is included.
Phone OTP stays disabled until an SMS provider is configured.

After deployment, copy the final *.vercel.app URL back to ChatGPT. The next step is to set the Supabase Auth Site URL / redirect URL and verify login, management, club/team/player registry, and tournament workflows online.
