param(
    [Parameter(Mandatory = $true)][string]$InstallerPath,
    [string]$PreviousInstallerPath,
    [switch]$SkipUpgrade
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
. (Join-Path $PSScriptRoot 'Common.ps1')
. (Join-Path $PSScriptRoot 'TestAssertions.ps1')

$script:Passed = 0
$installRoot = Join-Path $env:LOCALAPPDATA 'PowerShellConfig'
$statePath = Join-Path $installRoot 'state\install-state.json'
$appExe = Join-Path $installRoot 'app\PowerShell Config.exe'
$uninstallExe = Join-Path $installRoot 'Uninstall.exe'

function Stop-AppProcesses {
    Get-Process -Name 'PowerShell Config' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

function Invoke-SilentInstaller {
    param([Parameter(Mandatory = $true)][string]$Path)

    $process = Start-Process -FilePath $Path -ArgumentList '/S' -PassThru -Wait
    if ($process.ExitCode -ne 0) {
        throw "Instalador retornou codigo $($process.ExitCode): $Path"
    }
}

function Invoke-SilentUninstaller {
    if (-not (Test-Path -LiteralPath $uninstallExe)) {
        throw "Uninstall.exe nao encontrado em $uninstallExe"
    }
    $process = Start-Process -FilePath $uninstallExe -ArgumentList '/S' -PassThru -Wait
    if ($process.ExitCode -ne 0) {
        throw "Uninstall.exe retornou codigo $($process.ExitCode)"
    }
}

function Remove-InstallResidue {
    Stop-AppProcesses
    if (Test-Path -LiteralPath $installRoot) {
        Remove-Item -LiteralPath $installRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
    $uninstKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\PowerShell Config'
    if (Test-Path -LiteralPath $uninstKey) {
        Remove-Item -LiteralPath $uninstKey -Recurse -Force -ErrorAction SilentlyContinue
    }
    $pwshProfile = & pwsh.exe -NoLogo -NoProfile -NonInteractive -Command '$PROFILE.CurrentUserCurrentHost'
    if ($pwshProfile -and (Test-Path -LiteralPath $pwshProfile)) {
        $content = Get-Content -LiteralPath $pwshProfile -Raw
        if ($content -match '(?ms)^# >>> powershell-config >>>.*?^# <<< powershell-config <<<\s*') {
            Remove-ManagedProfileBlock -ProfilePath $pwshProfile -OriginalExisted $true
        }
    }
}

try {
    Write-Host 'FASE 1: instalacao limpa'
    Remove-InstallResidue
    Invoke-SilentInstaller -Path $InstallerPath

    Assert-True -Condition (Test-Path -LiteralPath $statePath) -Message 'install-state.json deve existir apos instalacao'
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    foreach ($key in @('Profile', 'Terminal', 'TerminalFragment', 'DefaultTerminal', 'ExecutionPolicy', 'ManagedConfig', 'Fonts')) {
        Assert-True -Condition ($null -ne $state.PSObject.Properties[$key]) -Message "install-state.json deve conter a chave $key"
    }
    Assert-True -Condition (@($state.Fonts).Count -eq 4) -Message 'install-state.json deve registrar as 4 fontes Hack NF'

    $pwshProfile = & pwsh.exe -NoLogo -NoProfile -NonInteractive -Command '$PROFILE.CurrentUserCurrentHost'
    Assert-True -Condition (Test-Path -LiteralPath $pwshProfile) -Message '$PROFILE do usuario deve existir apos instalacao'
    $profileContent = Get-Content -LiteralPath $pwshProfile -Raw
    Assert-True -Condition ($profileContent.Contains('# >>> powershell-config >>>')) -Message '$PROFILE real deve conter o bloco gerenciado'

    $terminalSettingsPath = $state.Terminal.Path
    Assert-True -Condition (Test-Path -LiteralPath $terminalSettingsPath) -Message 'settings.json do Windows Terminal deve existir'
    $terminalSettings = Get-Content -LiteralPath $terminalSettingsPath -Raw | ConvertFrom-Json
    Assert-True -Condition ($null -ne $terminalSettings.profiles.defaults) -Message 'settings.json deve ter profiles.defaults mesclado'

    $fontRegistryPath = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts'
    foreach ($font in @($state.Fonts)) {
        Assert-True -Condition (Test-Path -LiteralPath $font.TargetPath) -Message "fonte deve estar instalada: $($font.TargetPath)"
    }

    Assert-True -Condition (Test-Path -LiteralPath (Join-Path $installRoot 'config\settings.json')) -Message 'config\settings.json deve existir'
    Assert-True -Condition (Test-Path -LiteralPath (Join-Path $installRoot 'config\themes\active.omp.json')) -Message 'tema ativo deve existir'
    Write-Host "FASE 1 OK ($script:Passed verificacoes)"

    Write-Host 'FASE 2: app desktop real'
    Stop-AppProcesses
    $env:POWERSHELL_CONFIG_DISABLE_STARTUP_SYNC = '1'
    $smokeResultPath = Join-Path ([System.IO.Path]::GetTempPath()) ('powershell-config-integration-' + [guid]::NewGuid().ToString('N') + '.json')
    $env:POWERSHELL_CONFIG_SMOKE_RESULT = $smokeResultPath
    try {
        $process = Start-Process -FilePath $appExe -ArgumentList '--hidden' -WindowStyle Hidden -PassThru
        if (-not $process.WaitForExit(20000)) {
            throw 'App nao concluiu o smoke test em 20 segundos rodando contra instalacao real.'
        }
        Assert-True -Condition ($process.ExitCode -eq 0) -Message "app deve encerrar com ExitCode 0 (obtido $($process.ExitCode))"
        Assert-True -Condition (Test-Path -LiteralPath $smokeResultPath) -Message 'renderer deve produzir resultado do smoke test contra instalacao real'
        $rendererResult = Get-Content -LiteralPath $smokeResultPath -Raw | ConvertFrom-Json
        Assert-True -Condition ([bool]$rendererResult.apiReady -and [bool]$rendererResult.overviewReady) -Message 'renderer deve reportar apiReady/overviewReady contra instalacao real'
    } finally {
        Remove-Item Env:POWERSHELL_CONFIG_SMOKE_RESULT -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $smokeResultPath -Force -ErrorAction SilentlyContinue
        Remove-Item Env:POWERSHELL_CONFIG_DISABLE_STARTUP_SYNC -ErrorAction SilentlyContinue
    }
    Write-Host "FASE 2 OK ($script:Passed verificacoes)"

    if (-not $SkipUpgrade -and $PreviousInstallerPath) {
        Write-Host 'FASE 3: upgrade sobre instalacao anterior'
        Remove-InstallResidue
        Invoke-SilentInstaller -Path $PreviousInstallerPath
        Assert-True -Condition (Test-Path -LiteralPath $statePath) -Message 'install-state.json deve existir apos instalacao da versao anterior'

        $customProfileDir = Join-Path $installRoot 'config'
        $customProfilePath = Join-Path $customProfileDir 'custom-profile.ps1'
        New-Item -ItemType Directory -Path $customProfileDir -Force | Out-Null
        $marker = "# integration-test-marker-$([guid]::NewGuid().ToString('N'))"
        Add-Content -LiteralPath $customProfilePath -Value $marker

        Invoke-SilentInstaller -Path $InstallerPath
        $upgradedState = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
        Assert-True -Condition (Test-Path -LiteralPath $statePath) -Message 'install-state.json deve sobreviver ao upgrade'
        Assert-True -Condition ((Get-Content -LiteralPath $customProfilePath -Raw).Contains($marker)) -Message 'customizacao do usuario em custom-profile.ps1 deve sobreviver ao upgrade'

        $profileContentAfterUpgrade = Get-Content -LiteralPath $pwshProfile -Raw
        Assert-True -Condition ($profileContentAfterUpgrade.Contains('# >>> powershell-config >>>')) -Message 'bloco do $PROFILE deve ser reverificado/reparado no upgrade'
        Write-Host "FASE 3 OK ($script:Passed verificacoes)"
    } else {
        Write-Host 'FASE 3 pulada: sem instalador de versao anterior disponivel'
    }

    Write-Host 'FASE 4: desinstalacao'
    Stop-AppProcesses
    Invoke-SilentUninstaller
    $profileContentAfterUninstall = if (Test-Path -LiteralPath $pwshProfile) { Get-Content -LiteralPath $pwshProfile -Raw } else { '' }
    Assert-True -Condition (-not $profileContentAfterUninstall.Contains('# >>> powershell-config >>>')) -Message 'bloco do $PROFILE deve ser removido apos desinstalacao'
    Assert-True -Condition (-not (Test-Path -LiteralPath $installRoot)) -Message 'INSTDIR deve ser removido apos desinstalacao'
    $terminalSettingsAfterUninstall = Get-Content -LiteralPath $terminalSettingsPath -Raw | ConvertFrom-Json
    Assert-True -Condition ($null -eq $terminalSettingsAfterUninstall.profiles.defaults -or $terminalSettingsAfterUninstall.profiles.defaults.PSObject.Properties.Count -eq 0) -Message 'chaves geridas em profiles.defaults devem ser revertidas apos desinstalacao'
    Write-Host "FASE 4 OK ($script:Passed verificacoes)"

    Write-Host "INTEGRATION_OK: $script:Passed verificacoes passaram."
    exit 0
} catch {
    Write-Host "INTEGRATION_FAIL: $($_.Exception.Message)"
    Write-Host ($_.ScriptStackTrace)
    exit 1
} finally {
    Remove-InstallResidue
}
