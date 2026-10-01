param(
    [string]$Message = "Rebuild frontend"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Building React frontend..." -ForegroundColor Cyan
Set-Location "$root\frontend"
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed." -ForegroundColor Red; exit 1 }

Write-Host "Copying build to backend/public..." -ForegroundColor Cyan
$dest = "$root\backend\public"
Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item "$root\frontend\build" $dest -Recurse

Write-Host "Committing and pushing..." -ForegroundColor Cyan
Set-Location $root
git add backend/public
git add backend/routes
git add backend/server.js
git add backend/db
git commit -m $Message
git push origin master

Write-Host "Done. Live at https://workforce-planner-production.up.railway.app" -ForegroundColor Green
