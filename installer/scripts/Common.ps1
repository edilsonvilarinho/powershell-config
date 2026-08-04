Set-StrictMode -Version Latest

$script:ManagedProfileStart = '# >>> powershell-config >>>'
$script:ManagedProfileEnd = '# <<< powershell-config <<<'
$script:PowerShellProfileGuid = '{574e775e-4f2a-5b96-ac1e-a2962a402336}'
$script:TerminalDelegationConsole = '{2EACA947-7F5F-4CFA-BA87-8F7FBEEFBE69}'
$script:TerminalDelegationTerminal = '{E12CFF52-A866-4C77-9A90-F570A7AA2C6B}'

function Write-Utf8NoBomFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content
    )

    $parent = Split-Path -Parent $Path
    if (-not [string]::IsNullOrWhiteSpace($parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Get-FileSha256 {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}

function Save-JsonFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)]$Value
    )

    Write-Utf8NoBomFile -Path $Path -Content ($Value | ConvertTo-Json -Depth 100)
}

function Read-JsonFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }
    $content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    try {
        return $content | ConvertFrom-Json -ErrorAction Stop
    } catch {
        if ($null -eq ('System.Text.Json.JsonDocument' -as [type])) {
            throw
        }
        $options = [System.Text.Json.JsonDocumentOptions]::new()
        $options.CommentHandling = [System.Text.Json.JsonCommentHandling]::Skip
        $options.AllowTrailingCommas = $true
        $document = [System.Text.Json.JsonDocument]::Parse($content, $options)
        try {
            return $document.RootElement.GetRawText() | ConvertFrom-Json -ErrorAction Stop
        } finally {
            $document.Dispose()
        }
    }
}

function Get-ManagedProfileBlock {
    return @"
$script:ManagedProfileStart
`$powerShellConfigProfile = Join-Path `$env:LOCALAPPDATA 'PowerShellConfig\profile.ps1'
if (Test-Path -LiteralPath `$powerShellConfigProfile) {
    . `$powerShellConfigProfile
}
$script:ManagedProfileEnd
"@
}

function Set-ManagedProfileBlock {
    param([Parameter(Mandatory = $true)][string]$ProfilePath)

    $content = if (Test-Path -LiteralPath $ProfilePath) {
        Get-Content -LiteralPath $ProfilePath -Raw -Encoding UTF8
    } else {
        ''
    }

    $pattern = '(?ms)^' + [regex]::Escape($script:ManagedProfileStart) + '.*?^' + [regex]::Escape($script:ManagedProfileEnd) + '\s*'
    $contentWithoutManagedBlock = [regex]::Replace($content, $pattern, '').TrimEnd()
    $newContent = if ([string]::IsNullOrWhiteSpace($contentWithoutManagedBlock)) {
        Get-ManagedProfileBlock
    } else {
        $contentWithoutManagedBlock + [Environment]::NewLine + [Environment]::NewLine + (Get-ManagedProfileBlock)
    }

    Write-Utf8NoBomFile -Path $ProfilePath -Content ($newContent.TrimEnd() + [Environment]::NewLine)
}

function Remove-ManagedProfileBlock {
    param(
        [Parameter(Mandatory = $true)][string]$ProfilePath,
        [bool]$OriginalExisted = $true
    )

    if (-not (Test-Path -LiteralPath $ProfilePath)) {
        return
    }

    $content = Get-Content -LiteralPath $ProfilePath -Raw -Encoding UTF8
    $pattern = '(?ms)^' + [regex]::Escape($script:ManagedProfileStart) + '.*?^' + [regex]::Escape($script:ManagedProfileEnd) + '\s*'
    $cleanContent = [regex]::Replace($content, $pattern, '').TrimEnd()

    if (-not $OriginalExisted -and [string]::IsNullOrWhiteSpace($cleanContent)) {
        Remove-Item -LiteralPath $ProfilePath -Force
        return
    }

    Write-Utf8NoBomFile -Path $ProfilePath -Content $(if ($cleanContent.Length -gt 0) { $cleanContent + [Environment]::NewLine } else { '' })
}

function Get-PropertySnapshot {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $property = $Object.PSObject.Properties[$Name]
    return [ordered]@{
        Exists = $null -ne $property
        Value = if ($null -ne $property) { $property.Value } else { $null }
    }
}

function Set-JsonProperty {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name,
        [AllowNull()]$Value
    )

    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) {
        $Object | Add-Member -NotePropertyName $Name -NotePropertyValue $Value
    } else {
        $property.Value = $Value
    }
}

function Remove-JsonProperty {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if ($null -ne $Object.PSObject.Properties[$Name]) {
        $Object.PSObject.Properties.Remove($Name)
    }
}

function Restore-JsonProperty {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)]$Snapshot
    )

    if ([bool]$Snapshot.Exists) {
        Set-JsonProperty -Object $Object -Name $Name -Value $Snapshot.Value
    } else {
        Remove-JsonProperty -Object $Object -Name $Name
    }
}

function Get-TerminalSettingsPath {
    $packaged = Join-Path $env:LOCALAPPDATA 'Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json'
    $unpackaged = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows Terminal\settings.json'

    if (Test-Path -LiteralPath $packaged) {
        return $packaged
    }
    if (Test-Path -LiteralPath $unpackaged) {
        return $unpackaged
    }
    return $packaged
}

function Get-ManagedTerminalActions {
    return @(
        [pscustomobject]@{ command = [pscustomobject]@{ action = 'copy'; singleLine = $false }; keys = 'ctrl+c' },
        [pscustomobject]@{ command = 'paste'; keys = 'ctrl+v' },
        [pscustomobject]@{ command = 'find'; keys = 'ctrl+shift+f' },
        [pscustomobject]@{ command = [pscustomobject]@{ action = 'splitPane'; split = 'auto'; splitMode = 'duplicate' }; keys = 'alt+shift+d' }
    )
}

function Test-JsonEquivalent {
    param([AllowNull()]$Left, [AllowNull()]$Right)

    $leftJson = $Left | ConvertTo-Json -Depth 100 -Compress
    $rightJson = $Right | ConvertTo-Json -Depth 100 -Compress
    return $leftJson -eq $rightJson
}

function Merge-TerminalSettings {
    param([Parameter(Mandatory = $true)][string]$Path)

    $settings = if (Test-Path -LiteralPath $Path) {
        Read-JsonFile -Path $Path
    } else {
        [pscustomobject]@{ '$schema' = 'https://aka.ms/terminal-profiles-schema' }
    }

    if ($null -eq $settings) {
        $settings = [pscustomobject]@{ '$schema' = 'https://aka.ms/terminal-profiles-schema' }
    }

    $profilesProperty = $settings.PSObject.Properties['profiles']
    if ($null -eq $profilesProperty -or $null -eq $profilesProperty.Value) {
        Set-JsonProperty -Object $settings -Name 'profiles' -Value ([pscustomobject]@{})
    }
    $profiles = $settings.profiles

    $defaultsProperty = $profiles.PSObject.Properties['defaults']
    if ($null -eq $defaultsProperty -or $null -eq $defaultsProperty.Value) {
        Set-JsonProperty -Object $profiles -Name 'defaults' -Value ([pscustomobject]@{})
    }
    $defaults = $profiles.defaults

    $snapshot = [ordered]@{
        DefaultProfile = Get-PropertySnapshot -Object $settings -Name 'defaultProfile'
        Defaults = [ordered]@{
            ColorScheme = Get-PropertySnapshot -Object $defaults -Name 'colorScheme'
            Elevate = Get-PropertySnapshot -Object $defaults -Name 'elevate'
            Font = Get-PropertySnapshot -Object $defaults -Name 'font'
            Opacity = Get-PropertySnapshot -Object $defaults -Name 'opacity'
            StartingDirectory = Get-PropertySnapshot -Object $defaults -Name 'startingDirectory'
            SuppressApplicationTitle = Get-PropertySnapshot -Object $defaults -Name 'suppressApplicationTitle'
            UseAcrylic = Get-PropertySnapshot -Object $defaults -Name 'useAcrylic'
        }
        Actions = @()
    }

    Set-JsonProperty -Object $settings -Name 'defaultProfile' -Value $script:PowerShellProfileGuid
    Set-JsonProperty -Object $defaults -Name 'colorScheme' -Value 'One Half Dark (modded)'
    Set-JsonProperty -Object $defaults -Name 'elevate' -Value $true
    Set-JsonProperty -Object $defaults -Name 'font' -Value ([pscustomobject]@{ face = 'Hack NF'; size = 11.0 })
    Set-JsonProperty -Object $defaults -Name 'opacity' -Value 80
    Set-JsonProperty -Object $defaults -Name 'startingDirectory' -Value $null
    Set-JsonProperty -Object $defaults -Name 'suppressApplicationTitle' -Value $true
    Set-JsonProperty -Object $defaults -Name 'useAcrylic' -Value $false

    $managedActions = @(Get-ManagedTerminalActions)
    $managedKeys = @($managedActions | ForEach-Object { $_.keys.ToLowerInvariant() })
    $existingActions = if ($null -ne $settings.PSObject.Properties['actions']) { @($settings.actions) } else { @() }
    $snapshot.Actions = @($existingActions | Where-Object { $null -ne $_.keys -and $managedKeys -contains $_.keys.ToString().ToLowerInvariant() })
    $preservedActions = @($existingActions | Where-Object { $null -eq $_.keys -or $managedKeys -notcontains $_.keys.ToString().ToLowerInvariant() })
    Set-JsonProperty -Object $settings -Name 'actions' -Value @($preservedActions + $managedActions)

    Save-JsonFile -Path $Path -Value $settings
    return [pscustomobject]@{
        Snapshot = $snapshot
        PostInstallHash = Get-FileSha256 -Path $Path
    }
}

function Restore-TerminalSettings {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)]$State
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    $currentHash = Get-FileSha256 -Path $Path
    if ($currentHash -eq $State.PostInstallHash) {
        if ([bool]$State.OriginalExisted -and (Test-Path -LiteralPath $State.BackupPath)) {
            Copy-Item -LiteralPath $State.BackupPath -Destination $Path -Force
        } elseif (-not [bool]$State.OriginalExisted) {
            Remove-Item -LiteralPath $Path -Force
        }
        return
    }

    $settings = Read-JsonFile -Path $Path
    if ($null -eq $settings) {
        return
    }

    $profiles = $settings.PSObject.Properties['profiles'].Value
    $defaults = if ($null -ne $profiles) { $profiles.PSObject.Properties['defaults'].Value } else { $null }
    if ($null -eq $profiles -or $null -eq $defaults) {
        return
    }

    if ($settings.defaultProfile -eq $script:PowerShellProfileGuid) {
        Restore-JsonProperty -Object $settings -Name 'defaultProfile' -Snapshot $State.Snapshot.DefaultProfile
    }

    $managedDefaults = [ordered]@{
        colorScheme = 'One Half Dark (modded)'
        elevate = $true
        font = [pscustomobject]@{ face = 'Hack NF'; size = 11.0 }
        opacity = 80
        startingDirectory = $null
        suppressApplicationTitle = $true
        useAcrylic = $false
    }
    if ($null -ne $State.PSObject.Properties['ManagedValues'] -and $null -ne $State.ManagedValues) {
        foreach ($name in @('colorScheme', 'elevate', 'font', 'opacity', 'startingDirectory', 'suppressApplicationTitle', 'useAcrylic')) {
            $managedProperty = $State.ManagedValues.PSObject.Properties[$name]
            if ($null -ne $managedProperty) {
                $managedDefaults[$name] = $managedProperty.Value
            }
        }
    }
    $snapshotNames = [ordered]@{
        colorScheme = 'ColorScheme'
        elevate = 'Elevate'
        font = 'Font'
        opacity = 'Opacity'
        startingDirectory = 'StartingDirectory'
        suppressApplicationTitle = 'SuppressApplicationTitle'
        useAcrylic = 'UseAcrylic'
    }
    foreach ($name in $managedDefaults.Keys) {
        $currentProperty = $defaults.PSObject.Properties[$name]
        if ($null -ne $currentProperty -and (Test-JsonEquivalent $currentProperty.Value $managedDefaults[$name])) {
            Restore-JsonProperty -Object $defaults -Name $name -Snapshot $State.Snapshot.Defaults.($snapshotNames[$name])
        }
    }

    $managedActions = @(Get-ManagedTerminalActions)
    $managedKeys = @($managedActions | ForEach-Object { $_.keys.ToLowerInvariant() })
    $currentActions = if ($null -ne $settings.PSObject.Properties['actions']) { @($settings.actions) } else { @() }
    $preserved = New-Object System.Collections.Generic.List[object]
    $restorableKeys = New-Object System.Collections.Generic.List[string]

    foreach ($action in $currentActions) {
        $key = if ($null -ne $action.keys) { $action.keys.ToString().ToLowerInvariant() } else { $null }
        if ($null -eq $key -or $managedKeys -notcontains $key) {
            $preserved.Add($action)
            continue
        }

        $expected = $managedActions | Where-Object { $_.keys.ToLowerInvariant() -eq $key } | Select-Object -First 1
        if (Test-JsonEquivalent $action $expected) {
            $restorableKeys.Add($key)
        } else {
            $preserved.Add($action)
        }
    }

    foreach ($oldAction in @($State.Snapshot.Actions)) {
        $oldKey = if ($null -ne $oldAction.keys) { $oldAction.keys.ToString().ToLowerInvariant() } else { $null }
        if ($null -ne $oldKey -and $restorableKeys -contains $oldKey) {
            $preserved.Add($oldAction)
        }
    }
    Set-JsonProperty -Object $settings -Name 'actions' -Value $preserved.ToArray()
    Save-JsonFile -Path $Path -Value $settings
}

function Get-DefaultTerminalRegistrySnapshot {
    $path = 'HKCU:\Console\%%Startup'
    $item = if (Test-Path -LiteralPath $path) { Get-ItemProperty -LiteralPath $path } else { $null }
    return [ordered]@{
        PathExisted = Test-Path -LiteralPath $path
        DelegationConsole = if ($null -ne $item) { Get-PropertySnapshot -Object $item -Name 'DelegationConsole' } else { [ordered]@{ Exists = $false; Value = $null } }
        DelegationTerminal = if ($null -ne $item) { Get-PropertySnapshot -Object $item -Name 'DelegationTerminal' } else { [ordered]@{ Exists = $false; Value = $null } }
    }
}

function Set-DefaultTerminal {
    $path = 'HKCU:\Console\%%Startup'
    New-Item -Path $path -Force | Out-Null
    New-ItemProperty -LiteralPath $path -Name 'DelegationConsole' -Value $script:TerminalDelegationConsole -PropertyType String -Force | Out-Null
    New-ItemProperty -LiteralPath $path -Name 'DelegationTerminal' -Value $script:TerminalDelegationTerminal -PropertyType String -Force | Out-Null
}

function Restore-DefaultTerminal {
    param([Parameter(Mandatory = $true)]$Snapshot)

    $path = 'HKCU:\Console\%%Startup'
    if (-not (Test-Path -LiteralPath $path)) {
        return
    }
    $current = Get-ItemProperty -LiteralPath $path
    $entries = [ordered]@{
        DelegationConsole = [pscustomobject]@{ Installed = $script:TerminalDelegationConsole; Previous = $Snapshot.DelegationConsole }
        DelegationTerminal = [pscustomobject]@{ Installed = $script:TerminalDelegationTerminal; Previous = $Snapshot.DelegationTerminal }
    }
    foreach ($name in $entries.Keys) {
        $currentProperty = $current.PSObject.Properties[$name]
        if ($null -eq $currentProperty -or $currentProperty.Value -ne $entries[$name].Installed) {
            continue
        }
        if ([bool]$entries[$name].Previous.Exists) {
            New-ItemProperty -LiteralPath $path -Name $name -Value $entries[$name].Previous.Value -PropertyType String -Force | Out-Null
        } else {
            Remove-ItemProperty -LiteralPath $path -Name $name -Force -ErrorAction SilentlyContinue
        }
    }
}

function Get-FontDefinitions {
    return @(
        [pscustomobject]@{ File = 'Hack Regular Nerd Font Complete Windows Compatible.ttf'; RegistryName = 'Hack NF (TrueType)' },
        [pscustomobject]@{ File = 'Hack Bold Nerd Font Complete Windows Compatible.ttf'; RegistryName = 'Hack NF Bold (TrueType)' },
        [pscustomobject]@{ File = 'Hack Italic Nerd Font Complete Windows Compatible.ttf'; RegistryName = 'Hack NF Italic (TrueType)' },
        [pscustomobject]@{ File = 'Hack Bold Italic Nerd Font Complete Windows Compatible.ttf'; RegistryName = 'Hack NF Bold Italic (TrueType)' }
    )
}

function Send-FontChangeNotification {
    if (-not ('PowerShellConfig.NativeMethods' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace PowerShellConfig {
    public static class NativeMethods {
        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, string lParam, uint flags, uint timeout, out IntPtr result);
    }
}
'@
    }
    $result = [IntPtr]::Zero
    [PowerShellConfig.NativeMethods]::SendMessageTimeout([IntPtr]0xffff, 0x001D, [IntPtr]::Zero, $null, 2, 1000, [ref]$result) | Out-Null
}
