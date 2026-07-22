<#
.SYNOPSIS
  Quick restart of both pyd-cost-comments services with NO unzip/install/build.
  Use this after editing .env / .env.local directly on the server (env vars
  are only read at process start) -- not after a code change, which needs
  redeploy-onprem.ps1 instead.

.PARAMETER AppTaskName / DataApiTaskName
  Scheduled task names, per onprem-server-setup-runbook.md Part 7.

.EXAMPLE
  C:\ops\pyd-cost-comments\restart-onprem.ps1
#>
[CmdletBinding()]
param(
  [string]$AppTaskName     = 'pyd-cost-comments-app',
  [string]$DataApiTaskName = 'pyd-cost-comments-data-api'
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    OK: $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "    WARN: $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "    FAIL: $msg" -ForegroundColor Red }

function Stop-TaskAndWait([string]$TaskName) {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $task) { Write-Warn "Scheduled task '$TaskName' not found -- skipping stop."; return }
  try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction Stop } catch { Write-Warn "Stop-ScheduledTask '$TaskName': $($_.Exception.Message)" }
  for ($i = 0; $i -lt 15; $i++) {
    if ((Get-ScheduledTask -TaskName $TaskName).State -ne 'Running') { break }
    Start-Sleep -Seconds 1
  }
  Write-Ok "'$TaskName' stopped"
}

function Kill-Port([int]$Port) {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    Write-Warn "Port $Port still held by PID $($c.OwningProcess) -- killing it."
    Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
  }
}

function Start-TaskAndWait([string]$TaskName) {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $task) { Write-Warn "Scheduled task '$TaskName' not found -- cannot start."; return }
  Start-ScheduledTask -TaskName $TaskName
  Start-Sleep -Seconds 2
  Write-Ok "'$TaskName' started"
}

try {
  Write-Step "Stopping"
  Stop-TaskAndWait $DataApiTaskName
  Stop-TaskAndWait $AppTaskName
  Start-Sleep -Seconds 1
  Kill-Port 4000
  Kill-Port 3000

  Write-Step "Starting"
  Start-TaskAndWait $DataApiTaskName
  Start-TaskAndWait $AppTaskName

  Write-Step "Health check"
  $dataApiOk = $false
  $appOk = $false
  for ($i = 0; $i -lt 10; $i++) {
    if (-not $dataApiOk) {
      try {
        $r = Invoke-WebRequest 'http://localhost:4000/health' -Proxy $null -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -eq 200 -and $r.Content -match '"ok"\s*:\s*true') { $dataApiOk = $true }
      } catch {}
    }
    if (-not $appOk) {
      try {
        $r = Invoke-WebRequest 'http://localhost:3000' -Proxy $null -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $appOk = $true }
      } catch {}
    }
    if ($dataApiOk -and $appOk) { break }
    Start-Sleep -Seconds 2
  }

  if ($dataApiOk) { Write-Ok "data-api /health responding" } else { Write-Err "data-api /health did NOT respond after 20s" }
  if ($appOk) { Write-Ok "app responding on :3000" } else { Write-Err "app did NOT respond on :3000 after 20s" }

  if ($dataApiOk -and $appOk) { Write-Host "`nRestart complete and healthy." -ForegroundColor Green; exit 0 }
  else { Write-Err "Restart finished but health checks failed."; exit 1 }

} catch {
  Write-Err $_.Exception.Message
  exit 1
}
