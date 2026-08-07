<#
Reset total do PowerShell Config para simular maquina zerada, permitindo reinstalar do zero.

Ordem de tentativa:
  1. Uninstall.exe /S (fluxo oficial NSIS) se existir em $INSTDIR.
  2. Fallback manual: Uninstall-PowerShellConfig.ps1 (reverte perfil/terminal/fontes/execution policy)
     + remocao forcada de atalhos, chave de registro e $INSTDIR, caso o Uninstall.exe esteja ausente
     ou tenha falhado (instalacao corrompida/parcial).

Uso:
  pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\installer\scripts\Reset-PowerShellConfig.ps1
  pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\installer\scripts\Reset-PowerShellConfig.ps1 -Force
#>
param(
    [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'PowerShellConfig'),
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$productName = 'PowerShell Config'
$uninstKeyPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$productName"
$startMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\$productName"

Write-Host "== Reset PowerShell Config ==" -ForegroundColor Cyan
Write-Host "InstallRoot: $InstallRoot"
Write-Host "Isso vai remover: instalacao, atalhos, chave de registro, e reverter perfil/Windows Terminal/fontes gerenciados."

if (-not $Force) {
    $answer = Read-Host "Confirmar reset total? (digite 'sim' para continuar)"
    if ($answer -ne 'sim') {
        Write-Host "Cancelado."
        exit 1
    }
}

# 1. Encerra processos do app (Uninstall.exe --shutdown so funciona com instalacao integra).
Get-Process -Name 'PowerShell Config' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

$uninstallerExe = Join-Path $InstallRoot 'Uninstall.exe'
$usedOfficialUninstaller = $false

if (Test-Path -LiteralPath $uninstallerExe) {
    Write-Host "Executando uninstaller oficial (silencioso)..." -ForegroundColor Yellow
    $proc = Start-Process -FilePath $uninstallerExe -ArgumentList '/S' -PassThru -Wait
    if ($proc.ExitCode -eq 0) {
        $usedOfficialUninstaller = $true
        Write-Host "Uninstaller oficial concluido." -ForegroundColor Green
    } else {
        Write-Host "Uninstaller oficial retornou codigo $($proc.ExitCode). Prosseguindo com fallback manual." -ForegroundColor Yellow
    }
} else {
    Write-Host "Uninstall.exe nao encontrado em $InstallRoot. Prosseguindo com fallback manual." -ForegroundColor Yellow
}

# 2. Fallback: reverte estado gerenciado (perfil, Windows Terminal, fontes, execution policy) via script real,
#    depois forca remocao de atalhos, chave de registro e diretorio, mesmo se algo acima falhou.
$statePath = Join-Path $InstallRoot 'state\install-state.json'
if (-not $usedOfficialUninstaller -and (Test-Path -LiteralPath $statePath)) {
    Write-Host "Revertendo estado gerenciado via Uninstall-PowerShellConfig.ps1..." -ForegroundColor Yellow
    $scriptPath = Join-Path $PSScriptRoot 'Uninstall-PowerShellConfig.ps1'
    try {
        & $scriptPath -InstallRoot $InstallRoot
        Write-Host "Estado gerenciado revertido." -ForegroundColor Green
    } catch {
        Write-Host "Falha ao reverter estado gerenciado: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Prosseguindo mesmo assim com remocao forcada (reset total tem prioridade)." -ForegroundColor Yellow
    }
}

Write-Host "Removendo atalhos..." -ForegroundColor Yellow
if (Test-Path -LiteralPath $startMenuDir) {
    Remove-Item -LiteralPath $startMenuDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Removendo chave de registro..." -ForegroundColor Yellow
if (Test-Path -LiteralPath $uninstKeyPath) {
    Remove-Item -LiteralPath $uninstKeyPath -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Removendo diretorio de instalacao..." -ForegroundColor Yellow
if (Test-Path -LiteralPath $InstallRoot) {
    Remove-Item -LiteralPath $InstallRoot -Recurse -Force -ErrorAction SilentlyContinue
}

if (Test-Path -LiteralPath $InstallRoot) {
    Write-Host "AVISO: $InstallRoot nao pode ser removido totalmente (arquivo em uso?). Verifique manualmente." -ForegroundColor Red
    exit 1
}

Write-Host "== Reset concluido. Maquina pronta para reinstalar do zero. ==" -ForegroundColor Green
exit 0
