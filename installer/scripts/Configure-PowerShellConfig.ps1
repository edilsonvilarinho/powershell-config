param(
    [Parameter(Mandatory = $true)][string]$InstallRoot,
    [Parameter(Mandatory = $true)][string]$ProductVersion,
    [string]$LogPath,
    [string]$LatestLogPath,
    [string]$SessionId
)

$ErrorActionPreference = 'Stop'
$commonPath = Join-Path $PSScriptRoot 'Common.ps1'
$loggingScript = Join-Path $PSScriptRoot 'InstallerLogging.ps1'
. $commonPath
. $loggingScript

$isDirectInvocation = [string]::IsNullOrWhiteSpace($LogPath)
$loggingContext = Initialize-InstallerLogging -LogPath $LogPath -LatestLogPath $LatestLogPath -SessionId $SessionId -Operation install -ResetLatest:$isDirectInvocation
$LogPath = $loggingContext.LogPath
$LatestLogPath = $loggingContext.LatestLogPath
$SessionId = $loggingContext.SessionId

$stateDirectory = Join-Path $InstallRoot 'state'
$backupDirectory = Join-Path $InstallRoot 'backups'
$statePath = Join-Path $stateDirectory 'install-state.json'

function Save-InstallState {
    param([Parameter(Mandatory = $true)]$State)
    Save-JsonFile -Path $statePath -Value $State
}

function Get-ExistingState {
    if (Test-Path -LiteralPath $statePath) {
        return Read-JsonFile -Path $statePath
    }
    return $null
}

function Install-RequiredModules {
    $installCommand = Get-Command Install-PSResource -ErrorAction SilentlyContinue
    if ($null -eq $installCommand) {
        throw 'Install-PSResource nao esta disponivel no PowerShell 7 instalado.'
    }
    Write-InstallerLog -Stage 'modules.preflight' -Message "command=$($installCommand.Source)"

    foreach ($moduleName in @('posh-git', 'Terminal-Icons', 'PSReadLine')) {
        Invoke-InstallerLoggedStep -Stage "modules.$moduleName" -Action {
            Install-PSResource -Name $moduleName -Repository PSGallery -Scope CurrentUser -TrustRepository -AcceptLicense -Quiet
        } | Out-Null
    }
}

function Install-ManagedFonts {
    param(
        [Parameter(Mandatory = $true)]$State,
        [bool]$CaptureOriginalState
    )

    $sourceDirectory = Join-Path $InstallRoot 'fonts'
    $targetDirectory = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Fonts'
    $registryPath = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts'
    New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
    New-Item -Path $registryPath -Force | Out-Null

    foreach ($font in Get-FontDefinitions) {
        $stage = 'fonts.' + [System.IO.Path]::GetFileNameWithoutExtension($font.File).Replace(' ', '-')
        $script:CurrentInstallerStage = $stage
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        $sourcePath = Join-Path $sourceDirectory $font.File
        $targetPath = Join-Path $targetDirectory $font.File
        Write-InstallerLog -Stage $stage -Message "START source=$sourcePath target=$targetPath registryName=$($font.RegistryName)"

        try {
            if (-not (Test-Path -LiteralPath $sourcePath)) {
                throw "Fonte ausente no payload: $sourcePath"
            }

            $existingRegistryValue = Get-ItemProperty -LiteralPath $registryPath -Name $font.RegistryName -ErrorAction SilentlyContinue
            $previousFontState = $State.Fonts | Where-Object { $_.File -eq $font.File } | Select-Object -First 1
            $captureThisFont = $CaptureOriginalState -or $null -eq $previousFontState
            $fontState = if ($captureThisFont) {
                [ordered]@{
                    File = $font.File
                    RegistryName = $font.RegistryName
                    TargetPath = $targetPath
                    OriginalFileExisted = Test-Path -LiteralPath $targetPath
                    OriginalFileBackup = $null
                    OriginalRegistryExisted = $null -ne $existingRegistryValue
                    OriginalRegistryValue = if ($null -ne $existingRegistryValue) { $existingRegistryValue.($font.RegistryName) } else { $null }
                    InstalledHash = $null
                }
            } else {
                $previousFontState
            }

            if ($captureThisFont -and $fontState.OriginalFileExisted) {
                $backupPath = Join-Path $backupDirectory ('font-' + [System.IO.Path]::GetFileName($font.File))
                if (-not (Test-Path -LiteralPath $backupPath)) {
                    Copy-Item -LiteralPath $targetPath -Destination $backupPath
                    Write-InstallerLog -Stage $stage -Message "backupCreated=$backupPath"
                } else {
                    Write-InstallerLog -Stage $stage -Message "backupPreserved=$backupPath"
                }
                $fontState.OriginalFileBackup = $backupPath
            }

            $State.Fonts = @(Set-ManagedFontStateEntry -ExistingStates @($State.Fonts) -FontState $fontState)
            Save-InstallState -State $State

            $syncResult = Sync-ManagedFile -SourcePath $sourcePath -TargetPath $targetPath
            Write-InstallerLog -Stage $stage -Message "sourceHash=$($syncResult.SourceHash) targetHash=$($syncResult.PreviousTargetHash)"
            if ($syncResult.Action -eq 'Skip') {
                Write-InstallerLog -Stage $stage -Message 'SKIP arquivo identico; copia nao executada'
            } else {
                Write-InstallerLog -Stage $stage -Message 'COPY arquivo instalado'
            }

            New-ItemProperty -LiteralPath $registryPath -Name $font.RegistryName -Value $targetPath -PropertyType String -Force | Out-Null
            $fontState.InstalledHash = $syncResult.InstalledHash
            $State.Fonts = @(Set-ManagedFontStateEntry -ExistingStates @($State.Fonts) -FontState $fontState)
            Save-InstallState -State $State

            $stopwatch.Stop()
            Write-InstallerLog -Stage $stage -Message "SUCCESS installedHash=$($fontState.InstalledHash) durationMs=$($stopwatch.ElapsedMilliseconds)"
        } catch {
            $stopwatch.Stop()
            Write-InstallerLog -Level 'ERROR' -Stage $stage -Message "FAILURE durationMs=$($stopwatch.ElapsedMilliseconds) message=$($_.Exception.Message)"
            throw
        }
    }

    Invoke-InstallerLoggedStep -Stage 'fonts.notification' -Action { Send-FontChangeNotification } | Out-Null
}

$existingState = $null
$isUpgrade = $false
$state = $null

try {
    Write-InstallerLog -Stage 'configure' -Message "START productVersion=$ProductVersion installRoot=$InstallRoot"

    Invoke-InstallerLoggedStep -Stage 'state.directories' -Action {
        New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
        New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
    } | Out-Null

    $existingState = Invoke-InstallerLoggedStep -Stage 'state.load' -Action { Get-ExistingState }
    $isUpgrade = $null -ne $existingState
    $state = if ($isUpgrade) {
        $existingState
    } else {
        [ordered]@{
            SchemaVersion = 1
            ProductVersion = $ProductVersion
            InstalledAt = (Get-Date).ToString('O')
            Profile = $null
            Terminal = $null
            TerminalFragment = $null
            DefaultTerminal = $null
            ExecutionPolicy = $null
            ManagedConfig = $null
            Fonts = @()
        }
    }
    if ($isUpgrade -and $null -eq $state.PSObject.Properties['ManagedConfig']) {
        $state | Add-Member -NotePropertyName 'ManagedConfig' -NotePropertyValue $null
    }
    $state.ProductVersion = $ProductVersion
    Write-InstallerLog -Stage 'state.load' -Message "isUpgrade=$isUpgrade statePath=$statePath"

    Install-RequiredModules

    $managedConfigDirectory = Join-Path $InstallRoot 'config'
    $managedThemesDirectory = Join-Path $managedConfigDirectory 'themes'
    $settingsPath = Join-Path $managedConfigDirectory 'settings.json'
    $defaultSettingsPath = Join-Path $InstallRoot 'settings.default.json'
    $activeThemePath = Join-Path $managedThemesDirectory 'active.omp.json'
    $defaultThemePath = Join-Path $InstallRoot 'takuya.omp.json'
    Invoke-InstallerLoggedStep -Stage 'managedConfig' -Action {
        New-Item -ItemType Directory -Path $managedThemesDirectory -Force | Out-Null
        if (-not $isUpgrade -or $null -eq $state.ManagedConfig) {
            $state.ManagedConfig = [ordered]@{
                SettingsPath = $settingsPath
                SettingsOriginalExisted = Test-Path -LiteralPath $settingsPath
                SettingsInstalledHash = $null
                ThemePath = $activeThemePath
                ThemeOriginalExisted = Test-Path -LiteralPath $activeThemePath
                ThemeInstalledHash = $null
            }
        }
        if (-not (Test-Path -LiteralPath $settingsPath)) {
            Copy-Item -LiteralPath $defaultSettingsPath -Destination $settingsPath
            Write-InstallerLog -Stage 'managedConfig' -Message "settingsCreated=$settingsPath"
        } else {
            Write-InstallerLog -Stage 'managedConfig' -Message "settingsPreserved=$settingsPath"
        }
        if (-not (Test-Path -LiteralPath $activeThemePath)) {
            Copy-Item -LiteralPath $defaultThemePath -Destination $activeThemePath
            Write-InstallerLog -Stage 'managedConfig' -Message "themeCreated=$activeThemePath"
        } else {
            Write-InstallerLog -Stage 'managedConfig' -Message "themePreserved=$activeThemePath"
        }
        $state.ManagedConfig.SettingsInstalledHash = Get-FileSha256 -Path $settingsPath
        $state.ManagedConfig.ThemeInstalledHash = Get-FileSha256 -Path $activeThemePath
        Save-InstallState -State $state
    } | Out-Null

    $profilePath = $PROFILE.CurrentUserCurrentHost
    Invoke-InstallerLoggedStep -Stage 'profile' -Action {
        if (-not $isUpgrade -or $null -eq $state.Profile) {
            $profileExisted = Test-Path -LiteralPath $profilePath
            $profileBackup = if ($profileExisted) { Join-Path $backupDirectory 'Microsoft.PowerShell_profile.ps1.original' } else { $null }
            if ($profileExisted) {
                Copy-Item -LiteralPath $profilePath -Destination $profileBackup -Force
                Write-InstallerLog -Stage 'profile' -Message "backup=$profileBackup"
            }
            $state.Profile = [ordered]@{
                Path = $profilePath
                OriginalExisted = $profileExisted
                BackupPath = $profileBackup
            }
        }
        Set-ManagedProfileBlock -ProfilePath $profilePath
        Save-InstallState -State $state
        Write-InstallerLog -Stage 'profile' -Message "path=$profilePath"
    } | Out-Null

    $terminalSettingsPath = Get-TerminalSettingsPath
    Invoke-InstallerLoggedStep -Stage 'terminal.settings' -Action {
        $terminalExisted = Test-Path -LiteralPath $terminalSettingsPath
        if (-not $isUpgrade -or $null -eq $state.Terminal) {
            $terminalBackup = if ($terminalExisted) { Join-Path $backupDirectory 'windows-terminal-settings.json.original' } else { $null }
            if ($terminalExisted) {
                Copy-Item -LiteralPath $terminalSettingsPath -Destination $terminalBackup -Force
                Write-InstallerLog -Stage 'terminal.settings' -Message "backup=$terminalBackup"
            }
            $mergeResult = Merge-TerminalSettings -Path $terminalSettingsPath
            $state.Terminal = [ordered]@{
                Path = $terminalSettingsPath
                OriginalExisted = $terminalExisted
                BackupPath = $terminalBackup
                Snapshot = $mergeResult.Snapshot
                PostInstallHash = $mergeResult.PostInstallHash
            }
        } else {
            $mergeResult = Merge-TerminalSettings -Path $terminalSettingsPath
            $state.Terminal.Path = $terminalSettingsPath
            $state.Terminal.PostInstallHash = $mergeResult.PostInstallHash
        }
        Save-InstallState -State $state
        Write-InstallerLog -Stage 'terminal.settings' -Message "path=$terminalSettingsPath postInstallHash=$($state.Terminal.PostInstallHash)"
    } | Out-Null

    $fragmentSource = Join-Path $InstallRoot 'terminal-fragment.json'
    $fragmentTarget = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows Terminal\Fragments\PowerShellConfig\powershell-config.json'
    Invoke-InstallerLoggedStep -Stage 'terminal.fragment' -Action {
        if (-not $isUpgrade -or $null -eq $state.TerminalFragment) {
            $fragmentExisted = Test-Path -LiteralPath $fragmentTarget
            $fragmentBackup = if ($fragmentExisted) { Join-Path $backupDirectory 'windows-terminal-fragment.original.json' } else { $null }
            if ($fragmentExisted) {
                Copy-Item -LiteralPath $fragmentTarget -Destination $fragmentBackup -Force
                Write-InstallerLog -Stage 'terminal.fragment' -Message "backup=$fragmentBackup"
            }
            $state.TerminalFragment = [ordered]@{
                Path = $fragmentTarget
                OriginalExisted = $fragmentExisted
                BackupPath = $fragmentBackup
                InstalledHash = $null
            }
        }
        New-Item -ItemType Directory -Path (Split-Path -Parent $fragmentTarget) -Force | Out-Null
        Copy-Item -LiteralPath $fragmentSource -Destination $fragmentTarget -Force
        $state.TerminalFragment.InstalledHash = Get-FileSha256 -Path $fragmentTarget
        Save-InstallState -State $state
        Write-InstallerLog -Stage 'terminal.fragment' -Message "path=$fragmentTarget installedHash=$($state.TerminalFragment.InstalledHash)"
    } | Out-Null

    Invoke-InstallerLoggedStep -Stage 'terminal.default' -Action {
        if (-not $isUpgrade -or $null -eq $state.DefaultTerminal) {
            $state.DefaultTerminal = Get-DefaultTerminalRegistrySnapshot
        }
        Set-DefaultTerminal
        Save-InstallState -State $state
    } | Out-Null

    Invoke-InstallerLoggedStep -Stage 'executionPolicy' -Action {
        if (-not $isUpgrade -or $null -eq $state.ExecutionPolicy) {
            $policies = Get-ExecutionPolicy -List
            $machinePolicy = ($policies | Where-Object Scope -eq 'MachinePolicy').ExecutionPolicy
            $userPolicy = ($policies | Where-Object Scope -eq 'UserPolicy').ExecutionPolicy
            $currentUserPolicy = ($policies | Where-Object Scope -eq 'CurrentUser').ExecutionPolicy
            $state.ExecutionPolicy = [ordered]@{
                PreviousCurrentUser = $currentUserPolicy.ToString()
                Changed = $false
            }

            $groupPolicyDefined = $machinePolicy -ne 'Undefined' -or $userPolicy -ne 'Undefined'
            if (-not $groupPolicyDefined -and $currentUserPolicy -in @('Undefined', 'Restricted')) {
                Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
                $state.ExecutionPolicy.Changed = $true
            }
            Write-InstallerLog -Stage 'executionPolicy' -Message "machinePolicy=$machinePolicy userPolicy=$userPolicy previousCurrentUser=$currentUserPolicy changed=$($state.ExecutionPolicy.Changed)"
        } else {
            Write-InstallerLog -Stage 'executionPolicy' -Message 'SKIP estado de upgrade preservado'
        }
        Save-InstallState -State $state
    } | Out-Null

    Install-ManagedFonts -State $state -CaptureOriginalState:(-not $isUpgrade -or @($state.Fonts).Count -eq 0)
    Save-InstallState -State $state
    Write-InstallerLog -Stage 'configure' -Message "SUCCESS PowerShell Config $ProductVersion configurado"
} catch {
    $primaryError = $_
    $primaryStage = $script:CurrentInstallerStage
    Write-InstallerErrorRecord -ErrorRecord $primaryError -Stage $primaryStage

    if ($isUpgrade) {
        Write-InstallerLog -Level 'WARN' -Stage 'rollback' -Message 'SKIP upgrade detectado; estado gerenciado anterior preservado'
    } elseif (Test-Path -LiteralPath $statePath) {
        try {
            $pwshPath = Join-Path $PSHOME 'pwsh.exe'
            $rollbackArguments = @(
                '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
                '-File', (Join-Path $PSScriptRoot 'Uninstall-PowerShellConfig.ps1'),
                '-InstallRoot', $InstallRoot,
                '-RollbackOnly',
                '-LogPath', $LogPath,
                '-LatestLogPath', $LatestLogPath,
                '-SessionId', $SessionId
            )
            $rollbackExitCode = Invoke-InstallerNativeCommand -FilePath $pwshPath -ArgumentList $rollbackArguments -Stage 'rollback' -DisplayCommand 'pwsh Uninstall-PowerShellConfig.ps1 -RollbackOnly' -OutputAlreadyLogged
            if ($rollbackExitCode -ne 0) {
                Write-InstallerLog -Level 'ERROR' -Stage 'rollback' -Message "FAILURE exitCode=$rollbackExitCode; causa primaria preservada"
            }
        } catch {
            Write-InstallerLog -Level 'ERROR' -Stage 'rollback' -Message "FAILURE ao iniciar rollback: $($_.Exception.Message); causa primaria preservada"
        }
    } else {
        Write-InstallerLog -Level 'WARN' -Stage 'rollback' -Message "SKIP estado nao encontrado em $statePath"
    }

    Write-InstallerLog -Level 'ERROR' -Stage 'configure' -Message "FAILURE primaryStage=$primaryStage logPath=$LogPath"
    exit 1
}
