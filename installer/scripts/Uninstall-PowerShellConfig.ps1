param(
    [Parameter(Mandatory = $true)][string]$InstallRoot,
    [switch]$RollbackOnly
)

$ErrorActionPreference = 'Stop'
$commonPath = Join-Path $PSScriptRoot 'Common.ps1'
. $commonPath

$statePath = Join-Path $InstallRoot 'state\install-state.json'
if (-not (Test-Path -LiteralPath $statePath)) {
    Write-Warning "Estado de instalacao nao encontrado: $statePath"
    exit 0
}

$state = Read-JsonFile -Path $statePath

try {
    if ($null -ne $state.Profile) {
        Remove-ManagedProfileBlock -ProfilePath $state.Profile.Path -OriginalExisted ([bool]$state.Profile.OriginalExisted)
    }

    if ($null -ne $state.Terminal) {
        Restore-TerminalSettings -Path $state.Terminal.Path -State $state.Terminal
    }

    if ($null -ne $state.TerminalFragment -and (Test-Path -LiteralPath $state.TerminalFragment.Path)) {
        $fragmentHash = Get-FileSha256 -Path $state.TerminalFragment.Path
        if ($fragmentHash -eq $state.TerminalFragment.InstalledHash) {
            if ([bool]$state.TerminalFragment.OriginalExisted -and (Test-Path -LiteralPath $state.TerminalFragment.BackupPath)) {
                Copy-Item -LiteralPath $state.TerminalFragment.BackupPath -Destination $state.TerminalFragment.Path -Force
            } elseif (-not [bool]$state.TerminalFragment.OriginalExisted) {
                Remove-Item -LiteralPath $state.TerminalFragment.Path -Force
            }
        }
    }

    if ($null -ne $state.DefaultTerminal) {
        Restore-DefaultTerminal -Snapshot $state.DefaultTerminal
    }

    if ($null -ne $state.ExecutionPolicy -and [bool]$state.ExecutionPolicy.Changed) {
        $currentUserPolicy = (Get-ExecutionPolicy -List | Where-Object Scope -eq 'CurrentUser').ExecutionPolicy
        if ($currentUserPolicy -eq 'RemoteSigned') {
            Set-ExecutionPolicy -ExecutionPolicy $state.ExecutionPolicy.PreviousCurrentUser -Scope CurrentUser -Force
        }
    }

    $fontRegistryPath = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts'
    foreach ($font in @($state.Fonts)) {
        if ((Test-Path -LiteralPath $font.TargetPath) -and (Get-FileSha256 -Path $font.TargetPath) -eq $font.InstalledHash) {
            if ([bool]$font.OriginalFileExisted -and $null -ne $font.OriginalFileBackup -and (Test-Path -LiteralPath $font.OriginalFileBackup)) {
                Copy-Item -LiteralPath $font.OriginalFileBackup -Destination $font.TargetPath -Force
            } else {
                Remove-Item -LiteralPath $font.TargetPath -Force
            }
        }

        $currentRegistry = Get-ItemProperty -LiteralPath $fontRegistryPath -Name $font.RegistryName -ErrorAction SilentlyContinue
        if ($null -ne $currentRegistry -and $currentRegistry.($font.RegistryName) -eq $font.TargetPath) {
            if ([bool]$font.OriginalRegistryExisted) {
                New-ItemProperty -LiteralPath $fontRegistryPath -Name $font.RegistryName -Value $font.OriginalRegistryValue -PropertyType String -Force | Out-Null
            } else {
                Remove-ItemProperty -LiteralPath $fontRegistryPath -Name $font.RegistryName -Force -ErrorAction SilentlyContinue
            }
        }
    }
    Send-FontChangeNotification

    if ($RollbackOnly) {
        Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
    }
    Write-Host 'Configuracoes gerenciadas removidas com sucesso.'
    exit 0
} catch {
    Write-Error $_
    exit 1
}
