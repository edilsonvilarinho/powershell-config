$ErrorActionPreference = 'Stop'
$devRoot = Join-Path $env:LOCALAPPDATA 'PowerShellConfigDev'
$pidFile = Join-Path $devRoot 'dev-server.pid'

if (-not (Test-Path -LiteralPath $pidFile)) {
    Write-Host "Nenhum dev server rastreado (PID file ausente em '$pidFile')."
    return
}

$processId = (Get-Content -LiteralPath $pidFile -Raw).Trim()
$proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
if ($proc) {
    # /T mata a arvore inteira (cmd -> npm -> concurrently -> vite/tsc/electron).
    & taskkill /PID $processId /T /F | Out-Null
    Write-Host "Dev server (PID $processId) e processos filhos encerrados."
} else {
    Write-Host "PID $processId ja nao existia."
}

Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue

# Fallback: garante que nao sobrou nenhum electron.exe apontando pra dist do app dev.
Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*dist\main\main\main.js*' } |
    ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host "Electron orfao (PID $($_.ProcessId)) encerrado."
    }
