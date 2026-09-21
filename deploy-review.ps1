param(
    [string]$Message = "Review build: update frontend"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Building review frontend (badge + review API)..." -ForegroundColor Cyan
Set-Location "$root\frontend"

$env:REACT_APP_API_URL    = 'https://workforce-planner-review.up.railway.app'
$env:REACT_APP_REVIEW_BADGE = 'true'
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed." -ForegroundColor Red; exit 1 }

# Clear env vars so they don't bleed into later sessions
Remove-Item Env:\REACT_APP_API_URL        -ErrorAction SilentlyContinue
Remove-Item Env:\REACT_APP_REVIEW_BADGE   -ErrorAction SilentlyContinue

Write-Host "Copying build to backend/public..." -ForegroundColor Cyan
$dest = "$root\backend\public"
Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item "$root\frontend\build" $dest -Recurse

Write-Host "Committing and pushing..." -ForegroundColor Cyan
Set-Location $root
git add backend/public
git commit -m $Message
git push origin master

Write-Host "Done. Review app live at https://workforce-planner-review.up.railway.app" -ForegroundColor Green
Write-Host "To switch back to production, run: .\deploy.ps1" -ForegroundColor Yellow
