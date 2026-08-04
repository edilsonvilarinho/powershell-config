# ==========================================
# 1. CONFIGURAÇÕES BÁSICAS E VARIÁVEIS
# ==========================================
[console]::InputEncoding = [console]::OutputEncoding = New-Object System.Text.UTF8Encoding
$env:GIT_SSH  = "C:\Windows\system32\OpenSSH\ssh.exe"
$user_profile = Join-Path $PSScriptRoot ".\user_profile.ps1"
$omp_config   = Join-Path $PSScriptRoot ".\tokyo.omp.json"

# ==========================================
# 2. MÓDULOS E OH MY POSH
# ==========================================
Import-Module posh-git
Import-Module PSReadLine

try {
   oh-my-posh init pwsh --config $omp_config | Invoke-Expression
}
catch {
    Set-ExecutionPolicy Bypass -Scope Process -Force
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://ohmyposh.dev/install.ps1'))
    oh-my-posh init pwsh --config $omp_config | Invoke-Expression
}

function Ensure-TerminalIcons {
    if (-not (Get-Module Terminal-Icons) -and (Get-Module -ListAvailable Terminal-Icons)) {
        Import-Module Terminal-Icons
    }
}

# ==========================================
# 3. CONFIGURAÇÕES DO PSREADLINE
# ==========================================
Set-PSReadLineOption -EditMode Emacs
Set-PSReadLineOption -BellStyle None
Set-PSReadLineKeyHandler -Chord 'Ctrl+d' -Function DeleteChar

if ($Host.UI.PSObject.Properties.Name -contains 'SupportsVirtualTerminal' -and $Host.UI.SupportsVirtualTerminal -and -not [Console]::IsOutputRedirected) {
    Set-PSReadLineOption -PredictionSource History
    Set-PSReadLineOption -PredictionViewStyle ListView
}

# ==========================================
# 4. ALIASES CUSTOMIZADOS
# ==========================================
Set-Alias g git
Set-Alias vim nvim
Set-Alias grep findstr
Set-Alias tig 'C:\Program Files\Git\usr\bin\tig.exe'
Set-Alias less 'C:\Program Files\Git\usr\bin\less.exe'

# Integração do ls/dir com o Terminal-Icons
Remove-Item Alias:ls -ErrorAction SilentlyContinue
Remove-Item Alias:dir -ErrorAction SilentlyContinue
function Invoke-DirectoryListing {
    Ensure-TerminalIcons
    Microsoft.PowerShell.Management\Get-ChildItem @args
}
Set-Alias ls Invoke-DirectoryListing
Set-Alias dir Invoke-DirectoryListing
Set-Alias ll Invoke-DirectoryListing

# ==========================================
# 5. UTILITÁRIOS DO SISTEMA
# ==========================================
function which ($command) {
  Get-Command -Name $command -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path -ErrorAction SilentlyContinue
}

Remove-Alias history -ErrorAction SilentlyContinue
function history {
    param ([Parameter()][Alias("c")][Switch]$Clear)
    if ($Clear){
        Clear-History
        [Microsoft.PowerShell.PSConsoleReadLine]::ClearHistory()
        return
    }
    Get-History
}

function lastBootUpTime {
    (get-date) - (gcim Win32_OperatingSystem).LastBootUpTime
}

function listFunctions {
    Get-Content $user_profile | Select-String -Pattern "function\s+([^\s{]+)" | Foreach-Object { $_.Matches.Groups[1].Value }
}

# ==========================================
# 6. GERENCIADORES DE AMBIENTE (JAVA E CLAUDE)
# ==========================================
#function j8 {
#    $env:JAVA_HOME = "C:\Program Files\java\jdk1.8.0_202"
#    $env:Path = "$env:JAVA_HOME\bin;" + $env:Path
#    Write-Host "Java 8 Ativo" -ForegroundColor Yellow
#    java -version
#}

#function j21 {
#    $env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.10.7-hotspot"
#    $env:Path = "$env:JAVA_HOME\bin;" + $env:Path
#    Write-Host "Java 21 Ativo" -ForegroundColor Green
#    java -version
#}

function contapessoal {
    Remove-Item Env:\CLAUDE_CONFIG_DIR -ErrorAction SilentlyContinue
    Write-Host "Claude Conta 1 (Principal) Ativa" -ForegroundColor Yellow
}

function contaempresa {
    $env:CLAUDE_CONFIG_DIR = "$HOME\.claude-conta2"
    Write-Host "Claude Conta 2 (Secundária) Ativa" -ForegroundColor Green
}

# ==========================================
# 7. MENU DE AJUDA
# ==========================================
function help {
    @"
# 🛠️ Meu Ambiente PowerShell

## 🚀 Atalhos e Aliases
* **g**: git
* **vim**: nvim
* **grep**: findstr
* **tig**: Git Tig
* **less**: less
* **ls / dir / ll**: Listagem de diretórios com ícones automáticos

## ☕ Java (Alternância)
* **j8**: Ativa o Java 8 (jdk1.8.0_202)
* **j21**: Ativa o Java 21 (jdk-21.0.10.7)

## 🤖 Claude Code (Contas)
* **contapessoal**: Usa a conta Principal (Padrão)
* **contaempresa**: Usa a conta Secundária (.claude-conta2)

## 🛠️ Comandos e Utilitários
* **history -c**: Limpa o histórico do terminal e do PSReadLine
* **lastBootUpTime**: Mostra o tempo de atividade do sistema desde o último boot
* **listFunctions**: Lista todas as funções criadas neste arquivo de perfil
* **which <comando>**: Retorna o caminho do executável do comando especificado

## ⌨️ Teclas de Atalho (PSReadLine)
* **Ctrl+d**: Deleta o caractere atual

"@ | Show-Markdown
}


# Limpa a tela (opcional) e chama a função help ao iniciar
Clear-Host
help