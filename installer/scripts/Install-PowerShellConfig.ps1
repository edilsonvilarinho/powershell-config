param(
    [Parameter(Mandatory = $true)][string]$InstallRoot,
    [Parameter(Mandatory = $true)][string]$ProductVersion,
    [string]$LogPath,
    [string]$LatestLogPath,
    [string]$SessionId
)

$ErrorActionPreference = 'Stop'
$loggingScript = Join-Path $PSScriptRoot 'InstallerLogging.ps1'
. $loggingScript

$isDirectInvocation = [string]::IsNullOrWhiteSpace($LogPath)
$loggingContext = Initialize-InstallerLogging -LogPath $LogPath -LatestLogPath $LatestLogPath -SessionId $SessionId -Operation install -ResetLatest:$isDirectInvocation
$LogPath = $loggingContext.LogPath
$LatestLogPath = $loggingContext.LatestLogPath
$SessionId = $loggingContext.SessionId

function Invoke-WinGet {
    param([Parameter(Mandatory = $true)][string]$PackageId)

    $commonArguments = @(
        '--id', $PackageId,
        '--exact',
        '--source', 'winget',
        '--accept-source-agreements',
        '--disable-interactivity'
    )

    $listStage = "winget.$PackageId.list"
    $listExitCode = Invoke-InstallerNativeCommand -FilePath 'winget.exe' -ArgumentList (@('list') + $commonArguments) -Stage $listStage -DisplayCommand "winget list --id $PackageId"
    $isInstalled = $listExitCode -eq 0

    if ($isInstalled) {
        $upgradeStage = "winget.$PackageId.upgrade"
        $upgradeArguments = @('upgrade') + $commonArguments + @('--silent', '--accept-package-agreements')
        $upgradeExitCode = Invoke-InstallerNativeCommand -FilePath 'winget.exe' -ArgumentList $upgradeArguments -Stage $upgradeStage -DisplayCommand "winget upgrade --id $PackageId"
        if ($upgradeExitCode -ne 0) {
            Write-InstallerLog -Level 'WARN' -Stage $upgradeStage -Message "upgradeExitCode=$upgradeExitCode; validando instalacao existente"
        }

        $validationExitCode = Invoke-InstallerNativeCommand -FilePath 'winget.exe' -ArgumentList (@('list') + $commonArguments) -Stage "winget.$PackageId.validate" -DisplayCommand "winget list --id $PackageId"
        if ($validationExitCode -ne 0) {
            throw "O pacote deixou de ser detectado apos a tentativa de atualizacao: $PackageId"
        }
        return
    }

    $installStage = "winget.$PackageId.install"
    $installArguments = @('install') + $commonArguments + @('--silent', '--accept-package-agreements')
    $installExitCode = Invoke-InstallerNativeCommand -FilePath 'winget.exe' -ArgumentList $installArguments -Stage $installStage -DisplayCommand "winget install --id $PackageId"
    if ($installExitCode -ne 0) {
        throw "Falha ao instalar $PackageId. Codigo: $installExitCode"
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
    Write-InstallerLog -Stage 'install' -Message "START productVersion=$ProductVersion installRoot=$InstallRoot logPath=$LogPath latestLogPath=$LatestLogPath"
    Write-InstallerLog -Stage 'install.runtime' -Message "windowsPowerShell=$($PSVersionTable.PSVersion) processArchitecture=$env:PROCESSOR_ARCHITECTURE"

    $platform = Invoke-InstallerLoggedStep -Stage 'preflight.platform' -Action {
        $os = Get-CimInstance Win32_OperatingSystem
        $build = [int]$os.BuildNumber
        $architecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
        if ($build -lt 19045) {
            throw "Windows sem suporte. Build detectada: $build. Minimo: Windows 10 22H2 build 19045."
        }
        if ($architecture -notin @('AMD64', 'ARM64')) {
            throw "Arquitetura sem suporte: $architecture. Use x64 ou ARM64."
        }
        [pscustomobject]@{ Caption = $os.Caption; Build = $build; Architecture = $architecture }
    }
    Write-InstallerLog -Stage 'preflight.platform' -Message "caption=$($platform.Caption) build=$($platform.Build) architecture=$($platform.Architecture)"

    $wingetCommand = Invoke-InstallerLoggedStep -Stage 'preflight.winget' -Action {
        $command = Get-Command winget.exe -ErrorAction SilentlyContinue
        if ($null -eq $command) {
            throw 'WinGet nao esta disponivel. Instale ou atualize o App Installer pela Microsoft Store.'
        }
        $command
    }
    Write-InstallerLog -Stage 'preflight.winget' -Message "path=$($wingetCommand.Source)"

    Invoke-InstallerLoggedStep -Stage 'preflight.github' -Action {
        Invoke-WebRequest -Uri 'https://github.com' -Method Head -UseBasicParsing -TimeoutSec 15 | Out-Null
    } | Out-Null

    Invoke-InstallerLoggedStep -Stage 'preflight.windowsTerminal' -Action {
        $terminalProcesses = @(Get-Process -Name WindowsTerminal -ErrorAction SilentlyContinue)
        if ($terminalProcesses.Count -gt 0) {
            throw 'Feche todas as janelas do Windows Terminal antes de continuar a instalacao.'
        }
    } | Out-Null

    foreach ($packageId in @(
        'Microsoft.WindowsTerminal',
        'Microsoft.PowerShell',
        'JanDeDobbeleer.OhMyPosh',
        'Git.Git',
        'Neovim.Neovim'
    )) {
        Invoke-WinGet -PackageId $packageId
    }

    $pwsh = Invoke-InstallerLoggedStep -Stage 'powershell7.resolve' -Action { Resolve-PowerShell7 }
    $pwshVersion = (Get-Item -LiteralPath $pwsh).VersionInfo.ProductVersion
    Write-InstallerLog -Stage 'powershell7.resolve' -Message "path=$pwsh version=$pwshVersion"

    $configureScript = Join-Path $PSScriptRoot 'Configure-PowerShellConfig.ps1'
    $configureArguments = @(
        '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', $configureScript,
        '-InstallRoot', $InstallRoot,
        '-ProductVersion', $ProductVersion,
        '-LogPath', $LogPath,
        '-LatestLogPath', $LatestLogPath,
        '-SessionId', $SessionId
    )
    $configureExitCode = Invoke-InstallerNativeCommand -FilePath $pwsh -ArgumentList $configureArguments -Stage 'configure' -DisplayCommand 'pwsh Configure-PowerShellConfig.ps1' -OutputAlreadyLogged
    if ($configureExitCode -ne 0) {
        throw "Configuracao do ambiente falhou. Codigo: $configureExitCode"
    }

    Write-InstallerLog -Stage 'install' -Message 'SUCCESS instalacao concluida'
    exit 0
} catch {
    $primaryError = $_
    Write-InstallerErrorRecord -ErrorRecord $primaryError -Stage $script:CurrentInstallerStage
    Write-InstallerLog -Level 'ERROR' -Stage 'install' -Message "FAILURE logPath=$LogPath"
    exit 1
}
