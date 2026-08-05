param(
    [Parameter(Mandatory = $true)][string]$InstallRoot,
    [switch]$RollbackOnly,
    [string]$LogPath,
    [string]$LatestLogPath,
    [string]$SessionId
)

$ErrorActionPreference = 'Stop'
$commonPath = Join-Path $PSScriptRoot 'Common.ps1'
$loggingScript = Join-Path $PSScriptRoot 'InstallerLogging.ps1'
. $commonPath
. $loggingScript

$operation = if ($RollbackOnly) { 'install' } else { 'uninstall' }
$isDirectInvocation = [string]::IsNullOrWhiteSpace($LogPath)
$loggingContext = Initialize-InstallerLogging -LogPath $LogPath -LatestLogPath $LatestLogPath -SessionId $SessionId -Operation $operation -ResetLatest:$isDirectInvocation
$LogPath = $loggingContext.LogPath
$LatestLogPath = $loggingContext.LatestLogPath
$SessionId = $loggingContext.SessionId

$statePath = Join-Path $InstallRoot 'state\install-state.json'
if (-not (Test-Path -LiteralPath $statePath)) {
    Write-InstallerLog -Level 'WARN' -Stage $operation -Message "Estado de instalacao nao encontrado: $statePath"
    exit 0
}

try {
    Write-InstallerLog -Stage $operation -Message "START installRoot=$InstallRoot rollbackOnly=$([bool]$RollbackOnly)"
    $state = Invoke-InstallerLoggedStep -Stage "$operation.state.load" -Action { Read-JsonFile -Path $statePath }

    Invoke-InstallerLoggedStep -Stage "$operation.profile" -Action {
        if ($null -ne $state.Profile) {
            Remove-ManagedProfileBlock -ProfilePath $state.Profile.Path -OriginalExisted ([bool]$state.Profile.OriginalExisted)
            Write-InstallerLog -Stage "$operation.profile" -Message "path=$($state.Profile.Path)"
        } else {
            Write-InstallerLog -Stage "$operation.profile" -Message 'SKIP estado ausente'
        }
    } | Out-Null

    Invoke-InstallerLoggedStep -Stage "$operation.terminal.settings" -Action {
        if ($null -ne $state.Terminal) {
            Restore-TerminalSettings -Path $state.Terminal.Path -State $state.Terminal
            Write-InstallerLog -Stage "$operation.terminal.settings" -Message "path=$($state.Terminal.Path)"
        } else {
            Write-InstallerLog -Stage "$operation.terminal.settings" -Message 'SKIP estado ausente'
        }
    } | Out-Null

    Invoke-InstallerLoggedStep -Stage "$operation.terminal.fragment" -Action {
        if ($null -ne $state.TerminalFragment -and (Test-Path -LiteralPath $state.TerminalFragment.Path)) {
            $fragmentHash = Get-FileSha256 -Path $state.TerminalFragment.Path
            if ($fragmentHash -eq $state.TerminalFragment.InstalledHash) {
                if ([bool]$state.TerminalFragment.OriginalExisted -and (Test-Path -LiteralPath $state.TerminalFragment.BackupPath)) {
                    Copy-Item -LiteralPath $state.TerminalFragment.BackupPath -Destination $state.TerminalFragment.Path -Force
                    Write-InstallerLog -Stage "$operation.terminal.fragment" -Message "RESTORE backup=$($state.TerminalFragment.BackupPath)"
                } elseif (-not [bool]$state.TerminalFragment.OriginalExisted) {
                    Remove-Item -LiteralPath $state.TerminalFragment.Path -Force
                    Write-InstallerLog -Stage "$operation.terminal.fragment" -Message "REMOVE path=$($state.TerminalFragment.Path)"
                }
            } else {
                Write-InstallerLog -Stage "$operation.terminal.fragment" -Message 'SKIP arquivo alterado depois da instalacao'
            }
        } else {
            Write-InstallerLog -Stage "$operation.terminal.fragment" -Message 'SKIP estado ou arquivo ausente'
        }
    } | Out-Null

    Invoke-InstallerLoggedStep -Stage "$operation.terminal.default" -Action {
        if ($null -ne $state.DefaultTerminal) {
            Restore-DefaultTerminal -Snapshot $state.DefaultTerminal
        } else {
            Write-InstallerLog -Stage "$operation.terminal.default" -Message 'SKIP estado ausente'
        }
    } | Out-Null

    Invoke-InstallerLoggedStep -Stage "$operation.executionPolicy" -Action {
        if ($null -ne $state.ExecutionPolicy -and [bool]$state.ExecutionPolicy.Changed) {
            $currentUserPolicy = (Get-ExecutionPolicy -List | Where-Object Scope -eq 'CurrentUser').ExecutionPolicy
            if ($currentUserPolicy -eq 'RemoteSigned') {
                Set-ExecutionPolicy -ExecutionPolicy $state.ExecutionPolicy.PreviousCurrentUser -Scope CurrentUser -Force
                Write-InstallerLog -Stage "$operation.executionPolicy" -Message "RESTORE value=$($state.ExecutionPolicy.PreviousCurrentUser)"
            } else {
                Write-InstallerLog -Stage "$operation.executionPolicy" -Message "SKIP valor atual preservado=$currentUserPolicy"
            }
        } else {
            Write-InstallerLog -Stage "$operation.executionPolicy" -Message 'SKIP nenhuma alteracao gerenciada'
        }
    } | Out-Null

    $fontRegistryPath = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts'
    foreach ($font in @($state.Fonts)) {
        $fontStage = "$operation.fonts." + [System.IO.Path]::GetFileNameWithoutExtension($font.File).Replace(' ', '-')
        Invoke-InstallerLoggedStep -Stage $fontStage -Action {
            if ((Test-Path -LiteralPath $font.TargetPath) -and (Get-FileSha256 -Path $font.TargetPath) -eq $font.InstalledHash) {
                if ([bool]$font.OriginalFileExisted -and $null -ne $font.OriginalFileBackup -and (Test-Path -LiteralPath $font.OriginalFileBackup)) {
                    Copy-Item -LiteralPath $font.OriginalFileBackup -Destination $font.TargetPath -Force
                    Write-InstallerLog -Stage $fontStage -Message "RESTORE backup=$($font.OriginalFileBackup) target=$($font.TargetPath)"
                } else {
                    Remove-Item -LiteralPath $font.TargetPath -Force
                    Write-InstallerLog -Stage $fontStage -Message "REMOVE target=$($font.TargetPath)"
                }
            } else {
                Write-InstallerLog -Stage $fontStage -Message 'SKIP arquivo ausente ou alterado depois da instalacao'
            }

            $currentRegistry = Get-ItemProperty -LiteralPath $fontRegistryPath -Name $font.RegistryName -ErrorAction SilentlyContinue
            if ($null -ne $currentRegistry -and $currentRegistry.($font.RegistryName) -eq $font.TargetPath) {
                if ([bool]$font.OriginalRegistryExisted) {
                    New-ItemProperty -LiteralPath $fontRegistryPath -Name $font.RegistryName -Value $font.OriginalRegistryValue -PropertyType String -Force | Out-Null
                    Write-InstallerLog -Stage $fontStage -Message "RESTORE registryName=$($font.RegistryName)"
                } else {
                    Remove-ItemProperty -LiteralPath $fontRegistryPath -Name $font.RegistryName -Force -ErrorAction SilentlyContinue
                    Write-InstallerLog -Stage $fontStage -Message "REMOVE registryName=$($font.RegistryName)"
                }
            } else {
                Write-InstallerLog -Stage $fontStage -Message "SKIP registro ausente ou alterado registryName=$($font.RegistryName)"
            }
        } | Out-Null
    }
    Invoke-InstallerLoggedStep -Stage "$operation.fonts.notification" -Action { Send-FontChangeNotification } | Out-Null

    Invoke-InstallerLoggedStep -Stage "$operation.managedConfig" -Action {
        $managedConfigProperty = $state.PSObject.Properties['ManagedConfig']
        $managedConfig = if ($null -ne $managedConfigProperty) { $managedConfigProperty.Value } else { $null }
        if ($RollbackOnly -and $null -ne $managedConfig) {
            if (Remove-ManagedFileIfPristine -Path $managedConfig.SettingsPath -InstalledHash $managedConfig.SettingsInstalledHash -OriginalExisted ([bool]$managedConfig.SettingsOriginalExisted)) {
                Write-InstallerLog -Stage "$operation.managedConfig" -Message "REMOVE path=$($managedConfig.SettingsPath)"
            } else {
                Write-InstallerLog -Stage "$operation.managedConfig" -Message 'SKIP settings ausente, alterado ou preexistente'
            }
            if (Remove-ManagedFileIfPristine -Path $managedConfig.ThemePath -InstalledHash $managedConfig.ThemeInstalledHash -OriginalExisted ([bool]$managedConfig.ThemeOriginalExisted)) {
                Write-InstallerLog -Stage "$operation.managedConfig" -Message "REMOVE path=$($managedConfig.ThemePath)"
            } else {
                Write-InstallerLog -Stage "$operation.managedConfig" -Message 'SKIP tema ausente, alterado ou preexistente'
            }
        } else {
            Write-InstallerLog -Stage "$operation.managedConfig" -Message 'SKIP estado ausente ou nao e rollback de instalacao nova'
        }
    } | Out-Null

    if ($RollbackOnly) {
        Invoke-InstallerLoggedStep -Stage 'rollback.state' -Action {
            Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
        } | Out-Null
    }
    Write-InstallerLog -Stage $operation -Message 'SUCCESS configuracoes gerenciadas removidas'
    exit 0
} catch {
    $primaryError = $_
    Write-InstallerErrorRecord -ErrorRecord $primaryError -Stage $script:CurrentInstallerStage
    Write-InstallerLog -Level 'ERROR' -Stage $operation -Message "FAILURE logPath=$LogPath"
    exit 1
}
