param(
    [Parameter(Mandatory = $true)][string]$InstallRoot,
    [Parameter(Mandatory = $true)][string]$ProductVersion
)

$ErrorActionPreference = 'Stop'
$commonPath = Join-Path $PSScriptRoot 'Common.ps1'
. $commonPath

$stateDirectory = Join-Path $InstallRoot 'state'
$backupDirectory = Join-Path $InstallRoot 'backups'
$statePath = Join-Path $stateDirectory 'install-state.json'
New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null

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

    foreach ($moduleName in @('posh-git', 'Terminal-Icons', 'PSReadLine')) {
        Write-Host "Instalando modulo PowerShell: $moduleName"
        Install-PSResource -Name $moduleName -Repository PSGallery -Scope CurrentUser -TrustRepository -AcceptLicense -Quiet
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

    $fontStates = New-Object System.Collections.Generic.List[object]
    foreach ($font in Get-FontDefinitions) {
        $sourcePath = Join-Path $sourceDirectory $font.File
        $targetPath = Join-Path $targetDirectory $font.File
        if (-not (Test-Path -LiteralPath $sourcePath)) {
            throw "Fonte ausente no payload: $sourcePath"
        }

        $existingRegistryValue = Get-ItemProperty -LiteralPath $registryPath -Name $font.RegistryName -ErrorAction SilentlyContinue
        $previousFontState = if (-not $CaptureOriginalState) {
            @($State.Fonts | Where-Object { $_.File -eq $font.File })[0]
        } else {
            $null
        }
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
            Copy-Item -LiteralPath $targetPath -Destination $backupPath -Force
            $fontState.OriginalFileBackup = $backupPath
        }

        $fontStates.Add($fontState)
        $State.Fonts = $fontStates.ToArray()
        Save-InstallState -State $State

        Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
        New-ItemProperty -LiteralPath $registryPath -Name $font.RegistryName -Value $targetPath -PropertyType String -Force | Out-Null
        $fontState.InstalledHash = Get-FileSha256 -Path $targetPath
        Save-InstallState -State $State
    }
    $State.Fonts = $fontStates.ToArray()
    Send-FontChangeNotification
}

$existingState = Get-ExistingState
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
        Fonts = @()
    }
}

try {
    $state.ProductVersion = $ProductVersion
    Install-RequiredModules

    $profilePath = $PROFILE.CurrentUserCurrentHost
    if (-not $isUpgrade -or $null -eq $state.Profile) {
        $profileExisted = Test-Path -LiteralPath $profilePath
        $profileBackup = if ($profileExisted) { Join-Path $backupDirectory 'Microsoft.PowerShell_profile.ps1.original' } else { $null }
        if ($profileExisted) {
            Copy-Item -LiteralPath $profilePath -Destination $profileBackup -Force
        }
        $state.Profile = [ordered]@{
            Path = $profilePath
            OriginalExisted = $profileExisted
            BackupPath = $profileBackup
        }
    }
    Set-ManagedProfileBlock -ProfilePath $profilePath
    Save-InstallState -State $state

    $terminalSettingsPath = Get-TerminalSettingsPath
    $terminalExisted = Test-Path -LiteralPath $terminalSettingsPath
    if (-not $isUpgrade -or $null -eq $state.Terminal) {
        $terminalBackup = if ($terminalExisted) { Join-Path $backupDirectory 'windows-terminal-settings.json.original' } else { $null }
        if ($terminalExisted) {
            Copy-Item -LiteralPath $terminalSettingsPath -Destination $terminalBackup -Force
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

    $fragmentSource = Join-Path $InstallRoot 'terminal-fragment.json'
    $fragmentTarget = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows Terminal\Fragments\PowerShellConfig\powershell-config.json'
    if (-not $isUpgrade -or $null -eq $state.TerminalFragment) {
        $fragmentExisted = Test-Path -LiteralPath $fragmentTarget
        $fragmentBackup = if ($fragmentExisted) { Join-Path $backupDirectory 'windows-terminal-fragment.original.json' } else { $null }
        if ($fragmentExisted) {
            Copy-Item -LiteralPath $fragmentTarget -Destination $fragmentBackup -Force
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

    if (-not $isUpgrade -or $null -eq $state.DefaultTerminal) {
        $state.DefaultTerminal = Get-DefaultTerminalRegistrySnapshot
    }
    Set-DefaultTerminal
    Save-InstallState -State $state

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
    }
    Save-InstallState -State $state

    Install-ManagedFonts -State $state -CaptureOriginalState:(-not $isUpgrade -or @($state.Fonts).Count -eq 0)
    Save-InstallState -State $state
    Write-Host "PowerShell Config $ProductVersion configurado com sucesso."
} catch {
    Write-Error $_
    if (Test-Path -LiteralPath $statePath) {
        $pwshPath = Join-Path $PSHOME 'pwsh.exe'
        & $pwshPath -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Uninstall-PowerShellConfig.ps1') -InstallRoot $InstallRoot -RollbackOnly | Out-Null
    }
    exit 1
}
