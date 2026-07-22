<#
.SYNOPSIS
  One-shot on-prem redeploy for pyd-cost-comments: stop -> unzip -> install
  (if needed) -> build -> start -> health-check. Replaces the manual runbook
  in prompts/onprem-server-setup-runbook.md / skills/deploy-onprem.md.

.DESCRIPTION
  Run this ON THE SERVER (PERDIS032), as local Administrator, after copying
  the latest app-<stamp>.zip / data-api-<stamp>.zip / manifest-<stamp>.json
  (produced by `npm run package:onprem` on the dev machine) into the drop
  folder (default C:\deploy-drop).

  This script only touches C:\apps\pyd-cost-comments and its scheduled
  tasks. It never touches IIS config or the co-hosted epm.pyd.es site.

  .env / .env.local are never in the zips (see .gitignore) and are left
  untouched by Expand-Archive -Force, since it only overwrites files that
  exist in the archive.

.PARAMETER DropFolder
  Where the zips + manifest were copied to. Default C:\deploy-drop.

.PARAMETER AppPath
  Deployed app folder. Default C:\apps\pyd-cost-comments.

.PARAMETER DataApiPath
  Deployed data-api folder. Default C:\apps\pyd-cost-comments\data-api.

.PARAMETER AppTaskName / DataApiTaskName
  Scheduled task names, per onprem-server-setup-runbook.md Part 7.

.PARAMETER SkipInstall
  Force-skip `npm install` in both folders regardless of what the manifest
  says (source-only change, dependencies definitely unchanged).

.PARAMETER ForceInstall
  Force `npm install` in both folders regardless of what the manifest says
  (use if you don't trust the manifest, or there's no manifest at all).

.PARAMETER NoStart
  Stop at "build succeeded" and leave both scheduled tasks stopped, for
  manual inspection before going live. No health checks are run.

.EXAMPLE
  C:\ops\pyd-cost-comments\redeploy-onprem.ps1
  Auto-detects the newest manifest/zips in C:\deploy-drop and does everything.

.EXAMPLE
  C:\ops\pyd-cost-comments\redeploy-onprem.ps1 -SkipInstall
  Source-only change (no package.json/lock touched) -- skip both npm installs.
#>
[CmdletBinding()]
param(
  [string]$DropFolder    = 'C:\deploy-drop',
  [string]$AppPath       = 'C:\apps\pyd-cost-comments',
  [string]$DataApiPath   = 'C:\apps\pyd-cost-comments\data-api',
  [string]$AppTaskName   = 'pyd-cost-comments-app',
  [string]$DataApiTaskName = 'pyd-cost-comments-data-api',
  [string]$AppZip,
  [string]$DataApiZip,
  [string]$ManifestPath,
  [switch]$SkipInstall,
  [switch]$ForceInstall,
  [switch]$NoStart
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
    $state = (Get-ScheduledTask -TaskName $TaskName).State
    if ($state -ne 'Running') { break }
    Start-Sleep -Seconds 1
  }
  Write-Ok "'$TaskName' stopped (state: $((Get-ScheduledTask -TaskName $TaskName).State))"
}

function Start-TaskAndWait([string]$TaskName) {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $task) { Write-Warn "Scheduled task '$TaskName' not found -- cannot start."; return }
  Start-ScheduledTask -TaskName $TaskName
  Start-Sleep -Seconds 2
  Write-Ok "'$TaskName' started (state: $((Get-ScheduledTask -TaskName $TaskName).State))"
}

function Kill-Port([int]$Port) {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    Write-Warn "Port $Port still held by PID $($c.OwningProcess) after task stop -- killing it."
    Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-Build([string]$Path, [string]$Label, [bool]$DoInstall) {
  Write-Step "$Label`: $(if ($DoInstall) { 'npm install + build' } else { 'build only (deps unchanged)' })"
  Push-Location $Path
  try {
    if ($DoInstall) {
      npm install
      if ($LASTEXITCODE -ne 0) { throw "npm install failed in $Path (exit $LASTEXITCODE)" }
      # Not checked for failure on purpose: "npm approve-scripts" only exists on
      # some npm versions (server had npm 11.16.0 as of 21/07/2026) and approves
      # native postinstall scripts (esbuild/sharp) npm's allow-scripts gate
      # blocks by default. On npm versions without this gate it's a harmless
      # "Unknown command" no-op; if scripts really are needed and blocked, the
      # next line (npm run build) fails clearly instead of silently.
      npm approve-scripts --all 2>$null
    }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed in $Path (exit $LASTEXITCODE)" }
    Write-Ok "$Label build succeeded"
  } finally {
    Pop-Location
  }
}

try {
  Write-Step "Resolving zips/manifest in $DropFolder"

  if (-not $ManifestPath) {
    $latestManifest = Get-ChildItem -Path $DropFolder -Filter 'manifest-*.json' -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($latestManifest) { $ManifestPath = $latestManifest.FullName }
  }

  $manifest = $null
  if ($ManifestPath -and (Test-Path $ManifestPath)) {
    $manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
    $stamp = $manifest.stamp
    if (-not $AppZip)     { $AppZip     = Join-Path $DropFolder "app-$stamp.zip" }
    if (-not $DataApiZip) { $DataApiZip = Join-Path $DropFolder "data-api-$stamp.zip" }
    Write-Ok "Using manifest $ManifestPath (stamp $stamp)"
  } else {
    Write-Warn "No manifest found -- defaulting to 'install both' for safety."
  }

  if (-not $AppZip) {
    $z = Get-ChildItem -Path $DropFolder -Filter 'app-*.zip' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $z) { throw "No app-*.zip found in $DropFolder" }
    $AppZip = $z.FullName
  }
  if (-not $DataApiZip) {
    $z = Get-ChildItem -Path $DropFolder -Filter 'data-api-*.zip' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $z) { throw "No data-api-*.zip found in $DropFolder" }
    $DataApiZip = $z.FullName
  }
  if (-not (Test-Path $AppZip))     { throw "App zip not found: $AppZip" }
  if (-not (Test-Path $DataApiZip)) { throw "Data API zip not found: $DataApiZip" }
  Write-Ok "App zip:      $AppZip"
  Write-Ok "Data API zip: $DataApiZip"

  $installApp     = if ($SkipInstall) { $false } elseif ($ForceInstall) { $true } elseif ($manifest) { [bool]$manifest.app.depsChanged } else { $true }
  $installDataApi = if ($SkipInstall) { $false } elseif ($ForceInstall) { $true } elseif ($manifest) { [bool]$manifest.dataApi.depsChanged } else { $true }

  Write-Step "Stopping scheduled tasks"
  Stop-TaskAndWait $AppTaskName
  Stop-TaskAndWait $DataApiTaskName
  Start-Sleep -Seconds 1
  Kill-Port 3000
  Kill-Port 4000

  Write-Step "Extracting bundles (leaves .env / .env.local untouched)"
  Expand-Archive -Path $AppZip -DestinationPath $AppPath -Force
  Write-Ok "Extracted app to $AppPath"
  Expand-Archive -Path $DataApiZip -DestinationPath $DataApiPath -Force
  Write-Ok "Extracted data-api to $DataApiPath"

  Invoke-Build -Path $DataApiPath -Label 'data-api' -DoInstall $installDataApi
  Invoke-Build -Path $AppPath -Label 'app' -DoInstall $installApp

  if ($NoStart) {
    Write-Warn "-NoStart passed -- both services remain stopped. Start them manually once you're ready:"
    Write-Host "  Start-ScheduledTask -TaskName '$DataApiTaskName'"
    Write-Host "  Start-ScheduledTask -TaskName '$AppTaskName'"
    exit 0
  }

  Write-Step "Starting scheduled tasks"
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

  if ($dataApiOk -and $appOk) {
    Write-Host "`nRedeploy complete and healthy. Reminders:" -ForegroundColor Green
    Write-Host "  - Sanity check from a LAN browser (not just localhost): http://PERDIS032/"
    Write-Host "  - Tag the release on the dev machine: git tag deployed-onprem-<yyyymmdd> && git push origin --tags"
    Write-Host "  - Log it in logs/sessions.log.md per _SYSTEM.md §4"
    exit 0
  } else {
    Write-Err "Redeploy finished but health checks failed -- check logs before considering this live."
    exit 1
  }

} catch {
  Write-Err $_.Exception.Message
  Write-Warn "Aborted. Services may be left stopped -- check task state with:"
  Write-Host "  Get-ScheduledTask -TaskName '$AppTaskName','$DataApiTaskName' | Select TaskName, State"
  exit 1
}
