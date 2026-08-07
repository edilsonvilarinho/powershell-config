param(
    [string]$RepoPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
)

$ErrorActionPreference = 'Stop'
$desktopPath = Join-Path $RepoPath 'desktop'
if (-not (Test-Path -LiteralPath (Join-Path $desktopPath 'package.json'))) {
    throw "desktop/package.json nao encontrado em '$desktopPath'. Confirme -RepoPath."
}

$devRoot = Join-Path $env:LOCALAPPDATA 'PowerShellConfigDev'
$pidFile = Join-Path $devRoot 'dev-server.pid'
$logFile = Join-Path $devRoot 'dev-server.log'

if (Test-Path -LiteralPath $pidFile) {
    $existingId = Get-Content -LiteralPath $pidFile -Raw
    $existing = Get-Process -Id $existingId.Trim() -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "Ja esta rodando (PID $($existing.Id)). Use Stop-DevServer.ps1 antes de subir de novo."
        return
    }
    Remove-Item -LiteralPath $pidFile -Force
}

$configDir = Join-Path $devRoot 'config'
if (-not (Test-Path -LiteralPath $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $RepoPath 'powershell\takuya.omp.json') -Destination (Join-Path $devRoot 'takuya.omp.json')
    $settings = Get-Content -Raw (Join-Path $RepoPath 'powershell\settings.default.json') | ConvertFrom-Json
    $settings.startup.enabled = $false
    [System.IO.File]::WriteAllText(
        (Join-Path $configDir 'settings.json'),
        ($settings | ConvertTo-Json -Depth 20),
        [System.Text.UTF8Encoding]::new($false)
    )
    [System.IO.File]::WriteAllText(
        (Join-Path $devRoot 'terminal-settings.json'),
        '{"profiles":{"defaults":{}},"schemes":[{"name":"One Half Dark (modded)"}]}',
        [System.Text.UTF8Encoding]::new($false)
    )
    Write-Host "Raiz de dev criada em '$devRoot' (isolada do install real)."
} else {
    Write-Host "Reaproveitando raiz de dev existente em '$devRoot'."
}

$env:POWERSHELL_CONFIG_ROOT = $devRoot
$env:POWERSHELL_CONFIG_TERMINAL_SETTINGS = Join-Path $devRoot 'terminal-settings.json'
$env:POWERSHELL_CONFIG_DISABLE_STARTUP_SYNC = '1'

$process = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/c', "npm run dev >> `"$logFile`" 2>&1" `
    -WorkingDirectory $desktopPath `
    -WindowStyle Hidden `
    -PassThru

Set-Content -LiteralPath $pidFile -Value $process.Id -NoNewline
Write-Host "Dev server subindo (PID $($process.Id)). Log: $logFile"
Write-Host "A janela do Electron abre em alguns segundos (build inicial do main + vite)."
Write-Host "Para parar: .\.claude\skills\powershell-config-dev-local\scripts\Stop-DevServer.ps1"
