<#
.SYNOPSIS
  Restarts both local dev servers (Next.js app on :3000, data-api on :4000)
  in fresh windows so an .env.local edit actually takes effect -- Next.js
  (and tsx watch) only read .env files at process start, not on file change.

.EXAMPLE
  npm run dev:restart
#>
$ErrorActionPreference = 'SilentlyContinue'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Kill-Port([int]$Port) {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    Write-Host "Killing PID $($c.OwningProcess) on port $Port"
    Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
  }
}

Kill-Port 3000
Kill-Port 4000
Start-Sleep -Seconds 1

Write-Host "Starting data-api (:4000) in a new window..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$repoRoot\data-api'; npm run dev"

Write-Host "Starting app (:3000) in a new window..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$repoRoot'; npm run dev"

Write-Host "`nBoth dev servers restarting in their own windows -- check them for the fresh .env.local values." -ForegroundColor Green
