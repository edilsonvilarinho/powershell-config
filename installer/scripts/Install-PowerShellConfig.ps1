param(
    [Parameter(Mandatory = $true)][string]$InstallRoot,
    [Parameter(Mandatory = $true)][string]$ProductVersion
)

$ErrorActionPreference = 'Stop'
$logPath = Join-Path $env:LOCALAPPDATA 'PowerShellConfig-install.log'

function Write-InstallLog {
    param([Parameter(Mandatory = $true)][string]$Message)

    $line = '{0} {1}' -f (Get-Date).ToString('O'), $Message
    Write-Host $line
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}

function Invoke-WinGet {
    param([Parameter(Mandatory = $true)][string]$PackageId)

    $commonArguments = @(
        '--id', $PackageId,
        '--exact',
        '--source', 'winget',
        '--accept-source-agreements',
        '--disable-interactivity'
    )

    & winget list @commonArguments *> $null
    $isInstalled = $LASTEXITCODE -eq 0

    if ($isInstalled) {
        Write-InstallLog "Atualizando pacote stable: $PackageId"
        & winget upgrade @commonArguments --silent --accept-package-agreements 2>&1 |
            ForEach-Object { Write-InstallLog $_.ToString() }
        $upgradeExitCode = $LASTEXITCODE
        if ($upgradeExitCode -ne 0) {
            Write-InstallLog "Aviso: winget upgrade retornou $upgradeExitCode para $PackageId; a instalacao existente sera validada."
        }

        & winget list @commonArguments *> $null
        if ($LASTEXITCODE -ne 0) {
            throw "O pacote deixou de ser detectado apos a tentativa de atualizacao: $PackageId"
        }
        return
    }

    Write-InstallLog "Instalando pacote: $PackageId"
    & winget install @commonArguments --silent --accept-package-agreements 2>&1 |
        ForEach-Object { Write-InstallLog $_.ToString() }
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao instalar $PackageId. Codigo: $LASTEXITCODE"
    }
}

function Resolve-PowerShell7 {
    $command = Get-Command pwsh.exe -ErrorAction SilentlyContinue
    if ($null -ne $command) {
        return $command.Source
    }

    $programFilesCandidate = Join-Path $env:ProgramFiles 'PowerShell\7\pwsh.exe'
    if (Test-Path -LiteralPath $programFilesCandidate) {
        return $programFilesCandidate
    }

    $package = Get-AppxPackage -Name Microsoft.PowerShell -ErrorAction SilentlyContinue |
        Sort-Object Version -Descending |
        Select-Object -First 1
    if ($null -ne $package) {
        $packageCandidate = Join-Path $package.InstallLocation 'pwsh.exe'
        if (Test-Path -LiteralPath $packageCandidate) {
            return $packageCandidate
        }
    }

    throw 'PowerShell 7 foi instalado, mas pwsh.exe nao foi localizado.'
}

try {
    Write-InstallLog "Inicio da instalacao $ProductVersion"

    $os = Get-CimInstance Win32_OperatingSystem
    $build = [int]$os.BuildNumber
    if ($build -lt 19045) {
        throw "Windows sem suporte. Build detectada: $build. Minimo: Windows 10 22H2 build 19045."
    }

    $architecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    if ($architecture -notin @('AMD64', 'ARM64')) {
        throw "Arquitetura sem suporte: $architecture. Use x64 ou ARM64."
    }

    if ($null -eq (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
        throw 'WinGet nao esta disponivel. Instale ou atualize o App Installer pela Microsoft Store.'
    }

    try {
        Invoke-WebRequest -Uri 'https://github.com' -Method Head -UseBasicParsing -TimeoutSec 15 | Out-Null
    } catch {
        throw 'Nao foi possivel validar acesso HTTPS ao GitHub. Verifique internet, proxy ou firewall.'
    }

    $terminalProcesses = @(Get-Process -Name WindowsTerminal -ErrorAction SilentlyContinue)
    if ($terminalProcesses.Count -gt 0) {
        throw 'Feche todas as janelas do Windows Terminal antes de continuar a instalacao.'
    }

    foreach ($packageId in @(
        'Microsoft.WindowsTerminal',
        'Microsoft.PowerShell',
        'JanDeDobbeleer.OhMyPosh',
        'Git.Git',
        'Neovim.Neovim'
    )) {
        Invoke-WinGet -PackageId $packageId
    }

    $pwsh = Resolve-PowerShell7
    Write-InstallLog "PowerShell 7 localizado em: $pwsh"
    $configureScript = Join-Path $PSScriptRoot 'Configure-PowerShellConfig.ps1'
    & $pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File $configureScript -InstallRoot $InstallRoot -ProductVersion $ProductVersion 2>&1 |
        ForEach-Object { Write-InstallLog $_.ToString() }
    if ($LASTEXITCODE -ne 0) {
        throw "Configuracao do ambiente falhou. Codigo: $LASTEXITCODE"
    }

    Write-InstallLog 'Instalacao concluida com sucesso.'
    exit 0
} catch {
    Write-InstallLog ("ERRO: " + $_.Exception.Message)
    Write-Error $_
    exit 1
}
