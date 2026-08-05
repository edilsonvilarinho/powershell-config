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

# Registro da ajuda: cada comando e registrado no mesmo bloco que o define,
# entao Show-TerminalHelp descreve exatamente o que existe nesta sessao.
$global:PowerShellConfigHelpEntries = [System.Collections.Generic.List[object]]::new()

function Add-PowerShellConfigHelpEntry {
    param(
        [Parameter(Mandatory = $true)][string]$Section,
        [Parameter(Mandatory = $true)][string]$Name,
        [AllowNull()][string]$Target,
        [Parameter(Mandatory = $true)][string]$Description
    )

    $global:PowerShellConfigHelpEntries.Add([pscustomobject]@{
        Section = $Section
        Name = $Name
        Target = $Target
        Description = $Description
    })
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
            Add-PowerShellConfigHelpEntry -Section 'Teclas' -Name 'Ctrl+d' -Target $null -Description 'Apaga o caractere atual'
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
        Add-PowerShellConfigHelpEntry -Section 'Atalhos' -Name $aliasName -Target 'Invoke-DirectoryListing' -Description 'Lista o diretório com Terminal-Icons'
    }
}

if ((Get-PowerShellConfigSetting -Path @('aliases', 'g') -DefaultValue $true) -and (Get-Command git -ErrorAction SilentlyContinue)) {
    Set-Alias g git
    Add-PowerShellConfigHelpEntry -Section 'Atalhos' -Name 'g' -Target 'git' -Description 'Executa o Git'
}

if ((Get-PowerShellConfigSetting -Path @('aliases', 'vim') -DefaultValue $true) -and (Get-Command nvim -ErrorAction SilentlyContinue)) {
    Set-Alias vim nvim
    Add-PowerShellConfigHelpEntry -Section 'Atalhos' -Name 'vim' -Target 'nvim' -Description 'Abre o Neovim'
}

if (Get-PowerShellConfigSetting -Path @('aliases', 'grep') -DefaultValue $true) {
    Set-Alias grep findstr
    Add-PowerShellConfigHelpEntry -Section 'Atalhos' -Name 'grep' -Target 'findstr' -Description 'Filtra texto com o findstr'
}

$gitBinDirectory = Join-Path $env:ProgramFiles 'Git\usr\bin'
$tigPath = Join-Path $gitBinDirectory 'tig.exe'
$lessPath = Join-Path $gitBinDirectory 'less.exe'
if ((Get-PowerShellConfigSetting -Path @('aliases', 'tig') -DefaultValue $true) -and (Test-Path -LiteralPath $tigPath)) {
    Set-Alias tig $tigPath
    Add-PowerShellConfigHelpEntry -Section 'Atalhos' -Name 'tig' -Target 'tig.exe' -Description 'Navegador Git do Git for Windows'
}
if ((Get-PowerShellConfigSetting -Path @('aliases', 'less') -DefaultValue $true) -and (Test-Path -LiteralPath $lessPath)) {
    Set-Alias less $lessPath
    Add-PowerShellConfigHelpEntry -Section 'Atalhos' -Name 'less' -Target 'less.exe' -Description 'Paginador do Git for Windows'
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

Add-PowerShellConfigHelpEntry -Section 'Utilitários' -Name 'which <comando>' -Target $null -Description 'Informa o caminho do executável'
Add-PowerShellConfigHelpEntry -Section 'Utilitários' -Name 'history -c' -Target $null -Description 'Limpa o histórico da sessão e do PSReadLine'
Add-PowerShellConfigHelpEntry -Section 'Utilitários' -Name 'lastBootUpTime' -Target $null -Description 'Informa o tempo desde a última inicialização'

function ConvertTo-PowerShellConfigMarkdownText {
    param([AllowEmptyString()][string]$Value)

    $escaped = $Value.Replace('\', '\\')
    foreach ($character in @('`', '*', '_', '{', '}', '[', ']', '(', ')', '<', '>', '#', '+', '-', '.', '!', '|')) {
        $escaped = $escaped.Replace($character, "\$character")
    }
    return $escaped
}

function Get-PowerShellConfigHelpEntries {
    $entries = @($global:PowerShellConfigHelpEntries | Where-Object { $null -ne $_ })
    foreach ($entry in @($global:PowerShellConfigCustomHelpEntries | Where-Object { $null -ne $_ })) {
        $section = if ([string]$entry.Kind -eq 'Startup') { 'Ao abrir a sessão' } else { 'Personalizações' }
        $target = if ([string]::IsNullOrWhiteSpace([string]$entry.Target)) { $null } else { [string]$entry.Target }
        $entries += [pscustomobject]@{
            Section = $section
            Name = [string]$entry.Name
            Target = $target
            Description = [string]$entry.Description
        }
    }
    return $entries
}

function Show-TerminalHelp {
    $useMarkdown = $null -ne (Get-Command Show-Markdown -ErrorAction SilentlyContinue)
    $entries = @(Get-PowerShellConfigHelpEntries)
    $lines = @('# Ambiente PowerShell')

    foreach ($section in @('Atalhos', 'Utilitários', 'Teclas', 'Personalizações', 'Ao abrir a sessão')) {
        $sectionEntries = @($entries | Where-Object { $_.Section -eq $section })
        if ($sectionEntries.Count -eq 0) { continue }
        $lines += @('', "## $section", '')
        foreach ($entry in $sectionEntries) {
            $description = [string]$entry.Description
            if ($useMarkdown) {
                $description = ConvertTo-PowerShellConfigMarkdownText -Value $description
            }
            if ([string]::IsNullOrWhiteSpace([string]$entry.Target)) {
                $lines += "* ``$($entry.Name)``: $description"
            } else {
                $lines += "* ``$($entry.Name)`` → ``$($entry.Target)``: $description"
            }
        }
    }

    if ($entries.Count -eq 0) {
        $lines += @('', 'Nenhum comando gerenciado está ativo nesta sessão.')
    }

    $helpText = $lines -join "`n"
    if ($useMarkdown) {
        $helpText | Show-Markdown
    } else {
        Write-Host $helpText
    }
}

# O `help` nativo e preservado: sem argumentos exibe a ajuda deste ambiente,
# com argumentos continua delegando ao Get-Help original. A captura ignora o
# proprio wrapper para que recarregar o perfil nao gere recursao.
if ($null -eq $global:PowerShellConfigOriginalHelp) {
    $existingHelpScript = (Get-Command help -CommandType Function -ErrorAction SilentlyContinue).ScriptBlock
    if ($null -ne $existingHelpScript -and $existingHelpScript.ToString() -notmatch 'Show-TerminalHelp') {
        $global:PowerShellConfigOriginalHelp = $existingHelpScript
    }
}

function help {
    if ($args.Count -eq 0) {
        Show-TerminalHelp
        return
    }
    if ($null -ne $global:PowerShellConfigOriginalHelp) {
        & $global:PowerShellConfigOriginalHelp @args
        return
    }
    Microsoft.PowerShell.Core\Get-Help @args
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
