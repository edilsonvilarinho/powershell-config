# Perfil gerenciado pelo PowerShell Config.
# Dependencias sao instaladas pelo instalador; este arquivo nunca baixa software.

[Console]::InputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$powerShellConfigSettingsPath = Join-Path $PSScriptRoot 'config\settings.json'
$powerShellConfigSettings = $null
if (Test-Path -LiteralPath $powerShellConfigSettingsPath) {
    try {
        $powerShellConfigSettings = Get-Content -LiteralPath $powerShellConfigSettingsPath -Raw -Encoding UTF8 |
            ConvertFrom-Json -ErrorAction Stop
        if ($powerShellConfigSettings.schemaVersion -notin @(1, 2, 3)) {
            $powerShellConfigSettings = $null
        }
    } catch {
        Write-Warning "PowerShell Config ignorou settings.json invalido: $($_.Exception.Message)"
        $powerShellConfigSettings = $null
    }
}

function Get-PowerShellConfigSetting {
    param(
        [Parameter(Mandatory = $true)][string[]]$Path,
        [Parameter(Mandatory = $true)]$DefaultValue
    )

    $current = $powerShellConfigSettings
    foreach ($segment in $Path) {
        if ($null -eq $current) {
            return $DefaultValue
        }
        $property = $current.PSObject.Properties[$segment]
        if ($null -eq $property) {
            return $DefaultValue
        }
        $current = $property.Value
    }
    if ($null -eq $current) { return $DefaultValue }
    return $current
}

$openSshPath = Join-Path $env:WINDIR 'System32\OpenSSH\ssh.exe'
if (Test-Path -LiteralPath $openSshPath) {
    $env:GIT_SSH = $openSshPath
}

if ((Get-PowerShellConfigSetting -Path @('modules', 'poshGit') -DefaultValue $true) -and
    (Get-Module -ListAvailable -Name posh-git)) {
    Import-Module posh-git -ErrorAction SilentlyContinue
}

$isInteractiveConsole = $Host.Name -eq 'ConsoleHost' -and -not [Console]::IsOutputRedirected
$psReadLineEnabled = Get-PowerShellConfigSetting -Path @('psReadLine', 'enabled') -DefaultValue $true

if ($isInteractiveConsole -and $psReadLineEnabled -and (Get-Module -ListAvailable -Name PSReadLine)) {
    Import-Module PSReadLine -ErrorAction SilentlyContinue
    if (Get-Module -Name PSReadLine) {
        Set-PSReadLineOption -EditMode (Get-PowerShellConfigSetting -Path @('psReadLine', 'editMode') -DefaultValue 'Emacs')
        Set-PSReadLineOption -BellStyle (Get-PowerShellConfigSetting -Path @('psReadLine', 'bellStyle') -DefaultValue 'None')
        if (Get-PowerShellConfigSetting -Path @('psReadLine', 'ctrlD') -DefaultValue $true) {
            Set-PSReadLineKeyHandler -Chord 'Ctrl+d' -Function DeleteChar
        }
        $predictionSource = Get-PowerShellConfigSetting -Path @('psReadLine', 'predictionSource') -DefaultValue 'History'
        Set-PSReadLineOption -PredictionSource $predictionSource -ErrorAction SilentlyContinue
        if ($predictionSource -ne 'None') {
            Set-PSReadLineOption -PredictionViewStyle (Get-PowerShellConfigSetting -Path @('psReadLine', 'predictionViewStyle') -DefaultValue 'ListView') -ErrorAction SilentlyContinue
        }
    }
}

$ohMyPosh = Get-Command oh-my-posh -ErrorAction SilentlyContinue
$ohMyPoshTheme = Join-Path $PSScriptRoot 'config\themes\active.omp.json'
$fallbackTheme = Join-Path $PSScriptRoot 'takuya.omp.json'
if (-not (Test-Path -LiteralPath $ohMyPoshTheme)) {
    $ohMyPoshTheme = $fallbackTheme
}
$promptEnabled = Get-PowerShellConfigSetting -Path @('prompt', 'enabled') -DefaultValue $true
if ($isInteractiveConsole -and $promptEnabled -and $null -ne $ohMyPosh -and (Test-Path -LiteralPath $ohMyPoshTheme)) {
    oh-my-posh init pwsh --config $ohMyPoshTheme | Invoke-Expression
}

function Import-TerminalIconsIfAvailable {
    $enabled = Get-PowerShellConfigSetting -Path @('modules', 'terminalIcons') -DefaultValue $true
    if ($enabled -and -not (Get-Module -Name Terminal-Icons) -and (Get-Module -ListAvailable -Name Terminal-Icons)) {
        Import-Module Terminal-Icons -ErrorAction SilentlyContinue
    }
}

function Invoke-DirectoryListing {
    Import-TerminalIconsIfAvailable
    Microsoft.PowerShell.Management\Get-ChildItem @args
}

foreach ($aliasName in @('ls', 'dir', 'll')) {
    if (Get-PowerShellConfigSetting -Path @('aliases', $aliasName) -DefaultValue $true) {
        Remove-Item "Alias:$aliasName" -ErrorAction SilentlyContinue
        Set-Alias $aliasName Invoke-DirectoryListing
    }
}

if ((Get-PowerShellConfigSetting -Path @('aliases', 'g') -DefaultValue $true) -and (Get-Command git -ErrorAction SilentlyContinue)) {
    Set-Alias g git
}

if ((Get-PowerShellConfigSetting -Path @('aliases', 'vim') -DefaultValue $true) -and (Get-Command nvim -ErrorAction SilentlyContinue)) {
    Set-Alias vim nvim
}

if (Get-PowerShellConfigSetting -Path @('aliases', 'grep') -DefaultValue $true) {
    Set-Alias grep findstr
}

$gitBinDirectory = Join-Path $env:ProgramFiles 'Git\usr\bin'
$tigPath = Join-Path $gitBinDirectory 'tig.exe'
$lessPath = Join-Path $gitBinDirectory 'less.exe'
if ((Get-PowerShellConfigSetting -Path @('aliases', 'tig') -DefaultValue $true) -and (Test-Path -LiteralPath $tigPath)) {
    Set-Alias tig $tigPath
}
if ((Get-PowerShellConfigSetting -Path @('aliases', 'less') -DefaultValue $true) -and (Test-Path -LiteralPath $lessPath)) {
    Set-Alias less $lessPath
}

function which {
    param([Parameter(Mandatory = $true, Position = 0)][string]$Command)

    Get-Command -Name $Command -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty Path -ErrorAction SilentlyContinue
}

Remove-Alias history -ErrorAction SilentlyContinue
function history {
    param([Alias('c')][switch]$Clear)

    if ($Clear) {
        Clear-History
        if ('Microsoft.PowerShell.PSConsoleReadLine' -as [type]) {
            [Microsoft.PowerShell.PSConsoleReadLine]::ClearHistory()
        }
        return
    }

    Get-History
}

function lastBootUpTime {
    (Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
}

function Show-TerminalHelp {
    $helpText = @'
# Ambiente PowerShell

## Atalhos

* `g`: Git
* `vim`: Neovim
* `grep`: findstr
* `tig`: navegador Git do Git for Windows
* `less`: paginador do Git for Windows
* `ls`, `dir`, `ll`: listagem com Terminal-Icons

## Utilitarios

* `history -c`: limpa o historico da sessao e do PSReadLine
* `lastBootUpTime`: informa o tempo desde a ultima inicializacao
* `which <comando>`: informa o caminho do executavel
'@

    $customHelpEntries = @($global:PowerShellConfigCustomHelpEntries | Where-Object { $null -ne $_ })
    if ($customHelpEntries.Count -gt 0) {
        function ConvertTo-PowerShellConfigMarkdownText {
            param([AllowEmptyString()][string]$Value)

            $escaped = $Value.Replace('\', '\\')
            foreach ($character in @('`', '*', '_', '{', '}', '[', ']', '(', ')', '<', '>', '#', '+', '-', '.', '!', '|')) {
                $escaped = $escaped.Replace($character, "\$character")
            }
            return $escaped
        }

        $helpText = $helpText.TrimEnd() + "`n`n## Personalizações"
        foreach ($entry in $customHelpEntries) {
            $name = [string]$entry.Name
            $description = ConvertTo-PowerShellConfigMarkdownText -Value ([string]$entry.Description)
            if ($entry.Kind -eq 'Alias') {
                $target = [string]$entry.Target
                $helpText += "`n`n* ``$name`` → ``$target``: $description"
            } elseif ($entry.Kind -eq 'Function') {
                $helpText += "`n`n* ``$name``: $description"
            }
        }
    }

    if (Get-Command Show-Markdown -ErrorAction SilentlyContinue) {
        $helpText | Show-Markdown
    } else {
        Write-Host $helpText
    }
}

# Customizações são geradas pelo aplicativo em um único caminho fixo e têm a mesma
# capacidade de qualquer código inserido pelo próprio usuário em seu $PROFILE.
$powerShellConfigCustomProfilePath = Join-Path $PSScriptRoot 'config\custom-profile.ps1'
if (Test-Path -LiteralPath $powerShellConfigCustomProfilePath -PathType Leaf) {
    . $powerShellConfigCustomProfilePath
}

$firstRunMarker = Join-Path $PSScriptRoot 'state\first-run-complete'
$showFirstRunHelp = Get-PowerShellConfigSetting -Path @('help', 'showOnFirstRun') -DefaultValue $true
if ($isInteractiveConsole -and $showFirstRunHelp -and -not (Test-Path -LiteralPath $firstRunMarker)) {
    Show-TerminalHelp
    $markerDirectory = Split-Path -Parent $firstRunMarker
    New-Item -ItemType Directory -Path $markerDirectory -Force | Out-Null
    [System.IO.File]::WriteAllText($firstRunMarker, (Get-Date).ToString('O'), [System.Text.UTF8Encoding]::new($false))
}
