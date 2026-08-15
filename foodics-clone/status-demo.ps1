# foodics-clone demo status

$ErrorActionPreference = 'Continue'
$state   = "$env:USERPROFILE\.minimax\state\foodics-demo"
$urlFile = Join-Path $state 'url.txt'

function Get-ListeningOwner($port) {
    (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue).OwningProcess
}

$backendPid  = Get-ListeningOwner 4000
$frontendPid = Get-ListeningOwner 3000
$tunnelPid   = (Get-Process -Name cloudflared -ErrorAction SilentlyContinue).Id
$url         = $null
if (Test-Path $urlFile) {
    $url = (Get-Content $urlFile -Raw -ErrorAction SilentlyContinue).Trim()
}

function UpDown($procId, $label) {
    if ($procId) { return "UP   $label $procId" } else { return "DOWN" }
}

Write-Host "foodics-demo status"
Write-Host "==================="
Write-Host "  backend  :4000   $(UpDown $backendPid 'pid=')"
Write-Host "  frontend :3000   $(UpDown $frontendPid 'pid=')"
Write-Host "  tunnel           $(UpDown $tunnelPid 'pid=')"
Write-Host ""

if ($url) {
    Write-Host "  Public URL: $url" -ForegroundColor Green
} else {
    Write-Host "  Public URL: (none -- run start-demo.ps1 to get one)"
}

Write-Host ""
Write-Host "Logs: $state\logs\"
