# foodics-clone demo stopper

$ErrorActionPreference = 'Stop'
$state = "$env:USERPROFILE\.minimax\state\foodics-demo"

Write-Host "stopping foodics-demo ..."

# Kill any listener on our ports
foreach ($port in 3000, 4000) {
    Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "  killing :$port  pid=$($_.OwningProcess)"
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

# Kill cloudflared
Get-Process -Name cloudflared -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "  killing cloudflared  pid=$($_.Id)"
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}

# Also kill the cmd.exe wrappers
Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'foodics-clone' -or $_.CommandLine -match 'cloudflared' } |
    ForEach-Object {
        Write-Host "  killing cmd wrapper  pid=$($_.ProcessId)"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

# Clean pid files
foreach ($p in 'backend.pid','frontend.pid','tunnel.pid') {
    $f = Join-Path $state $p
    if (Test-Path $f) { Remove-Item $f -Force -ErrorAction SilentlyContinue }
}

Start-Sleep -Seconds 1
Write-Host "done."
