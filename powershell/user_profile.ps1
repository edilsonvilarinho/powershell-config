# Perfil gerenciado pelo PowerShell Config.
# Dependencias sao instaladas pelo instalador; este arquivo nunca baixa software.

[Console]::InputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$openSshPath = Join-Path $env:WINDIR 'System32\OpenSSH\ssh.exe'
if (Test-Path -LiteralPath $openSshPath) {
    $env:GIT_SSH = $openSshPath
}

if (Get-Module -ListAvailable -Name posh-git) {
    Import-Module posh-git -ErrorAction SilentlyContinue
}

$isInteractiveConsole = $Host.Name -eq 'ConsoleHost' -and -not [Console]::IsOutputRedirected

if ($isInteractiveConsole -and (Get-Module -ListAvailable -Name PSReadLine)) {
    Import-Module PSReadLine -ErrorAction SilentlyContinue
    if (Get-Module -Name PSReadLine) {
        Set-PSReadLineOption -EditMode Emacs
        Set-PSReadLineOption -BellStyle None
        Set-PSReadLineKeyHandler -Chord 'Ctrl+d' -Function DeleteChar
        Set-PSReadLineOption -PredictionSource History
        Set-PSReadLineOption -PredictionViewStyle ListView
    }
}

$ohMyPosh = Get-Command oh-my-posh -ErrorAction SilentlyContinue
$ohMyPoshTheme = Join-Path $PSScriptRoot 'takuya.omp.json'
if ($isInteractiveConsole -and $null -ne $ohMyPosh -and (Test-Path -LiteralPath $ohMyPoshTheme)) {
    oh-my-posh init pwsh --config $ohMyPoshTheme | Invoke-Expression
}

function Import-TerminalIconsIfAvailable {
    if (-not (Get-Module -Name Terminal-Icons) -and (Get-Module -ListAvailable -Name Terminal-Icons)) {
        Import-Module Terminal-Icons -ErrorAction SilentlyContinue
    }
}

function Invoke-DirectoryListing {
    Import-TerminalIconsIfAvailable
    Microsoft.PowerShell.Management\Get-ChildItem @args
}

Remove-Item Alias:ls -ErrorAction SilentlyContinue
Remove-Item Alias:dir -ErrorAction SilentlyContinue
Set-Alias ls Invoke-DirectoryListing
Set-Alias dir Invoke-DirectoryListing
Set-Alias ll Invoke-DirectoryListing

if (Get-Command git -ErrorAction SilentlyContinue) {
    Set-Alias g git
}

if (Get-Command nvim -ErrorAction SilentlyContinue) {
    Set-Alias vim nvim
}

Set-Alias grep findstr

$gitBinDirectory = Join-Path $env:ProgramFiles 'Git\usr\bin'
$tigPath = Join-Path $gitBinDirectory 'tig.exe'
$lessPath = Join-Path $gitBinDirectory 'less.exe'
if (Test-Path -LiteralPath $tigPath) {
    Set-Alias tig $tigPath
}
if (Test-Path -LiteralPath $lessPath) {
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

    if (Get-Command Show-Markdown -ErrorAction SilentlyContinue) {
        $helpText | Show-Markdown
    } else {
        Write-Host $helpText
    }
}

$firstRunMarker = Join-Path $PSScriptRoot 'state\first-run-complete'
if ($isInteractiveConsole -and -not (Test-Path -LiteralPath $firstRunMarker)) {
    Show-TerminalHelp
    $markerDirectory = Split-Path -Parent $firstRunMarker
    New-Item -ItemType Directory -Path $markerDirectory -Force | Out-Null
    [System.IO.File]::WriteAllText($firstRunMarker, (Get-Date).ToString('O'), [System.Text.UTF8Encoding]::new($false))
}
