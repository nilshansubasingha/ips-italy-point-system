$ErrorActionPreference = "Stop"
Write-Host "IPS Project 5.2 - Vercel production deployment" -ForegroundColor Cyan
Write-Host "Target scope: nilshan-s-projects" -ForegroundColor DarkGray

npx --yes vercel@latest whoami *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Vercel CLI needs a one-time login in this terminal." -ForegroundColor Yellow
  npx --yes vercel@latest login
  if ($LASTEXITCODE -ne 0) { throw "Vercel login did not complete." }
}

# Create a dedicated IPS project. If it already exists, continue and link to it.
npx --yes vercel@latest project add ips-italy-point-system --scope nilshan-s-projects
if ($LASTEXITCODE -ne 0) {
  Write-Host "Project may already exist; continuing with project linking." -ForegroundColor DarkGray
}

npx --yes vercel@latest link --yes --project ips-italy-point-system --scope nilshan-s-projects
if ($LASTEXITCODE -ne 0) { throw "Could not link the IPS folder to the Vercel project." }

npx --yes vercel@latest deploy --prod --yes --scope nilshan-s-projects
if ($LASTEXITCODE -ne 0) { throw "Vercel production deployment failed." }

Write-Host ""
Write-Host "Deployment finished. Copy the production URL shown above back into ChatGPT." -ForegroundColor Green
