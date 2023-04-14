#Install-Module posh-git -Scope CurrentUser -Force -AllowClobber
#Install-Module Terminal-Icons -Scope CurrentUser -Force -AllowClobber
#Install-Module PSReadLine -Scope CurrentUser -Force -AllowClobber
#Prompt
Import-Module posh-git
Import-Module Terminal-Icons
Import-Module PSReadLine
# Alias
#Set-Alias vim nvim
#Set-Alias ll ls
#Set-Alias g git
#Set-Alias grep findstr
#Set-Alias idea idea64.exe
#Set-Alias tig 'C:Program Files\Git\urs\bin\tig.exe'
#Set-Alias less 'C:Program Files\Git\urs\bin\less.exe'
#Set-Alias studio studio.bat

[console]::InputEncoding = [console]::OutputEncoding = New-Object System.Text.UTF8Encoding

#Import-Module posh-git
#Import-Module oh-my-posh
$omp_config = Join-Path $PSScriptRoot ".\takuya.omp.json"
#$FontPath = Join-Path $PSScriptRoot "fonts\"
#oh-my-posh --init --shell pwsh --config $omp_config | Invoke-Expression
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope CurrentUser
try {
   oh-my-posh init pwsh --config $omp_config | Invoke-Expression
}
catch {
    winget install JanDeDobbeleer.OhMyPosh
    oh-my-posh init pwsh --config $omp_config | Invoke-Expression
}
#Import-Module -Name Terminal-Icons

# PSReadLine
Set-PSReadLineOption -EditMode Emacs
Set-PSReadLineOption -BellStyle None
Set-PSReadLineKeyHandler -Chord 'Ctrl+d' -Function DeleteChar
Set-PSReadLineOption -PredictionSource History
Set-PSReadLineOption -PredictionViewStyle ListView

# Env
$env:GIT_SSH = "C:\Windows\system32\OpenSSH\ssh.exe"

# Alias
Set-Alias -Name vim -Value nvim
Set-Alias ll ls
Set-Alias g git
Set-Alias grep findstr
Set-Alias tig 'C:\Program Files\Git\usr\bin\tig.exe'
Set-Alias less 'C:\Program Files\Git\usr\bin\less.exe'

# Utilities
function which ($command) {
  Get-Command -Name $command -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty Path -ErrorAction SilentlyContinue
}

# it's a default alias for Get-History cmdlet
Remove-Alias history

# Usage: history      - just print the history, same as call Get-History
# Usage: history -c   - really clears the history
function history {
    param (
        # Clears history
        [Parameter()]
        [Alias("c")]
        [Switch]
        $Clear
    )

    if ($Clear){
        Clear-History
        [Microsoft.PowerShell.PSConsoleReadLine]::ClearHistory()
        return
    }

    Get-History
}
