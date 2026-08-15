# foodics-clone demo starter (PowerShell)
# Starts backend, frontend, and cloudflare tunnel -- all fully detached so
# they survive closing this terminal.
#
# Usage:
#   .\start-demo.ps1                 # start everything
#   .\start-demo.ps1 -NoTunnel      # start only backend + frontend (local-only)
#   .\start-demo.ps1 -SkipBuild     # don't rebuild frontend

param(
    [switch]$NoTunnel,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$root      = $PSScriptRoot
$state     = "$env:USERPROFILE\.minimax\state\foodics-demo"
$logDir    = "$state\logs"
$urlFile   = "$state\url.txt"
$cfExe     = "$env:USERPROFILE\.minimax\bin\cloudflared.exe"
$backendDir  = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'

New-Item -ItemType Directory -Force -Path $state, $logDir | Out-Null

function Stop-Stale {
    Get-NetTCPConnection -State Listen -LocalPort 3000,4000 -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    foreach ($p in 'backend.pid','frontend.pid','tunnel.pid') {
        $f = Join-Path $state $p
        if (Test-Path $f) { Remove-Item $f -Force -ErrorAction SilentlyContinue }
    }
    Start-Sleep -Seconds 1
}

function Wait-Http {
    param([string]$Url, [int]$TimeoutSec = 60)
    for ($i = 0; $i -lt $TimeoutSec; $i++) {
        try {
            $r = Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec 1 -ErrorAction SilentlyContinue
            if ($r.StatusCode -ge 200) { return $true }
        } catch {}
        Start-Sleep -Seconds 1
    }
    return $false
}

Write-Host "foodics-clone demo starter"
Write-Host "==========================="
Write-Host "stopping anything still running on :3000 / :4000 ..."
Stop-Stale

# Frontend build (skip if up to date)
if (-not $SkipBuild) {
    $layoutStamp = (Get-Item "$frontendDir\src\app\layout.tsx").LastWriteTime
    $buildStamp  = (Get-Item "$frontendDir\.next\BUILD_ID" -ErrorAction SilentlyContinue).LastWriteTime
    if (-not $buildStamp -or $layoutStamp -gt $buildStamp) {
        Write-Host "rebuilding frontend ..."
        Push-Location $frontendDir
        cmd.exe /c "npm run build" 2>&1 | Select-Object -Last 8 | ForEach-Object { Write-Host "  $_" }
        Pop-Location
    } else {
        Write-Host "frontend build is up to date - skipping"
    }
}

# Backend
Write-Host "starting backend ..."
$backendArgs = '/c "cd /d "' + $backendDir + '" && call npm run dev >> "' + $logDir + '\backend.log" 2>> "' + $logDir + '\backend.err.log""'
$si = New-Object System.Diagnostics.ProcessStartInfo
$si.FileName = 'cmd.exe'
$si.Arguments = $backendArgs
$si.UseShellExecute = $true
$si.WindowStyle = 'Hidden'
$si.CreateNoWindow = $true
[void][System.Diagnostics.Process]::Start($si)

# Frontend
Write-Host "starting frontend ..."
$frontendArgs = '/c "cd /d "' + $frontendDir + '" && call npm start >> "' + $logDir + '\frontend.log" 2>> "' + $logDir + '\frontend.err.log""'
$sf = New-Object System.Diagnostics.ProcessStartInfo
$sf.FileName = 'cmd.exe'
$sf.Arguments = $frontendArgs
$sf.UseShellExecute = $true
$sf.WindowStyle = 'Hidden'
$sf.CreateNoWindow = $true
[void][System.Diagnostics.Process]::Start($sf)

# Wait
Write-Host "waiting for backend on :4000 ..."
if (Wait-Http 'http://127.0.0.1:4000/health') { Write-Host "  backend UP" } else { Write-Host "  backend DOWN (check $logDir\backend.err.log)" }
Write-Host "waiting for frontend on :3000 ..."
if (Wait-Http 'http://127.0.0.1:3000/') { Write-Host "  frontend UP" } else { Write-Host "  frontend DOWN (check $logDir\frontend.err.log)" }

# Tunnel
if (-not $NoTunnel) {
    if (-not (Test-Path $cfExe)) {
        Write-Host "no cloudflared at $cfExe - skipping tunnel"
        Write-Host "  download from https://github.com/cloudflare/cloudflared/releases/latest"
    } else {
        Write-Host "starting cloudflare tunnel ..."
        $tunnelArgs = '/c ""' + $cfExe + '" tunnel --url http://localhost:3000 --no-autoupdate > "' + $logDir + '\tunnel.log" 2>&1'
        $st = New-Object System.Diagnostics.ProcessStartInfo
        $st.FileName = 'cmd.exe'
        $st.Arguments = $tunnelArgs
        $st.UseShellExecute = $false
        $st.CreateNoWindow = $true
        $tproc = [System.Diagnostics.Process]::Start($st)
        $tproc.Id | Out-File (Join-Path $state 'tunnel.pid')
        Write-Host "  tunnel  pid=$($tproc.Id)"

        Write-Host "waiting for tunnel URL ..."
        $url = $null
        for ($i = 0; $i -lt 45; $i++) {
            Start-Sleep -Seconds 1
            if (Test-Path "$logDir\tunnel.log") {
                $m = [regex]::Match((Get-Content "$logDir\tunnel.log" -Raw -ErrorAction SilentlyContinue), 'https://[a-z0-9-]+\.trycloudflare\.com')
                if ($m.Success) { $url = $m.Value; break }
            }
        }
        if ($url) {
            $url | Out-File $urlFile -Encoding utf8
            Write-Host ""
            Write-Host "================================================="
            Write-Host "  Public URL: $url" -ForegroundColor Green
            Write-Host "  (saved to $urlFile)" -ForegroundColor DarkGray
            Write-Host "================================================="
        } else {
            Write-Host "  URL not found in 45s - check $logDir\tunnel.log"
        }
    }
}

Write-Host ""
Write-Host "status: .\status-demo.ps1"
Write-Host "stop:   .\stop-demo.ps1"
