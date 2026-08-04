param([string]$ExpectedVersion)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$commonPath = Join-Path $PSScriptRoot 'Common.ps1'
. $commonPath

$script:Passed = 0

function Assert-True {
    param(
        [Parameter(Mandatory = $true)][bool]$Condition,
        [Parameter(Mandatory = $true)][string]$Message
    )

    if (-not $Condition) {
        throw "FALHA: $Message"
    }
    $script:Passed++
}

function Assert-Equal {
    param(
        [AllowNull()]$Expected,
        [AllowNull()]$Actual,
        [Parameter(Mandatory = $true)][string]$Message
    )

    if (-not (Test-JsonEquivalent $Expected $Actual)) {
        throw "FALHA: $Message`nEsperado: $($Expected | ConvertTo-Json -Depth 20 -Compress)`nAtual: $($Actual | ConvertTo-Json -Depth 20 -Compress)"
    }
    $script:Passed++
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('powershell-config-tests-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

try {
    $profilePath = Join-Path $tempRoot 'Microsoft.PowerShell_profile.ps1'
    Write-Utf8NoBomFile -Path $profilePath -Content "Write-Host 'conteudo do usuario'`n"
    Set-ManagedProfileBlock -ProfilePath $profilePath
    Set-ManagedProfileBlock -ProfilePath $profilePath
    $profileContent = Get-Content -LiteralPath $profilePath -Raw
    Assert-True -Condition (([regex]::Matches($profileContent, [regex]::Escape($script:ManagedProfileStart))).Count -eq 1) -Message 'o bloco de perfil deve ser idempotente'
    Assert-True -Condition ($profileContent.Contains("Write-Host 'conteudo do usuario'")) -Message 'o conteudo preexistente do perfil deve ser preservado'
    Remove-ManagedProfileBlock -ProfilePath $profilePath -OriginalExisted $true
    $profileAfterRemoval = Get-Content -LiteralPath $profilePath -Raw
    Assert-True -Condition ($profileAfterRemoval.Contains("Write-Host 'conteudo do usuario'")) -Message 'a remocao deve preservar o conteudo do usuario'
    Assert-True -Condition (-not $profileAfterRemoval.Contains($script:ManagedProfileStart)) -Message 'a remocao deve excluir o bloco gerenciado'

    $newProfilePath = Join-Path $tempRoot 'new-profile.ps1'
    Set-ManagedProfileBlock -ProfilePath $newProfilePath
    Remove-ManagedProfileBlock -ProfilePath $newProfilePath -OriginalExisted $false
    Assert-True -Condition (-not (Test-Path -LiteralPath $newProfilePath)) -Message 'perfil criado pelo instalador deve ser removido quando ficar vazio'

    $terminalPath = Join-Path $tempRoot 'settings.json'
    $terminalBackup = Join-Path $tempRoot 'settings.original.json'
    $originalSettings = [pscustomobject]@{
        defaultProfile = '{custom-profile}'
        theme = 'dark'
        profiles = [pscustomobject]@{
            defaults = [pscustomobject]@{ opacity = 95; elevate = $false }
            list = @([pscustomobject]@{ name = 'Custom'; guid = '{custom-profile}' })
        }
        actions = @(
            [pscustomobject]@{ command = 'customCopy'; keys = 'ctrl+c' },
            [pscustomobject]@{ command = 'newTab'; keys = 'ctrl+t' }
        )
    }
    Save-JsonFile -Path $terminalPath -Value $originalSettings
    Copy-Item -LiteralPath $terminalPath -Destination $terminalBackup
    $merge = Merge-TerminalSettings -Path $terminalPath
    $merged = Read-JsonFile -Path $terminalPath
    Assert-Equal -Expected $script:PowerShellProfileGuid -Actual $merged.defaultProfile -Message 'PowerShell 7 deve ser o perfil padrao'
    Assert-True -Condition ([bool]$merged.profiles.defaults.elevate) -Message 'todos os perfis devem ser elevados'
    Assert-Equal -Expected 'Hack NF' -Actual $merged.profiles.defaults.font.face -Message 'fonte gerenciada deve ser Hack NF'
    Assert-True -Condition (@($merged.actions | Where-Object keys -eq 'ctrl+c').Count -eq 1) -Message 'atalho gerenciado nao pode ser duplicado'
    Merge-TerminalSettings -Path $terminalPath | Out-Null
    $mergedAgain = Read-JsonFile -Path $terminalPath
    Assert-True -Condition (@($mergedAgain.actions | Where-Object keys -eq 'ctrl+c').Count -eq 1) -Message 'merge repetido deve permanecer idempotente'

    Set-JsonProperty -Object $mergedAgain -Name 'theme' -Value 'light'
    Save-JsonFile -Path $terminalPath -Value $mergedAgain
    $terminalState = [pscustomobject]@{
        OriginalExisted = $true
        BackupPath = $terminalBackup
        Snapshot = $merge.Snapshot
        PostInstallHash = $merge.PostInstallHash
    }
    Restore-TerminalSettings -Path $terminalPath -State $terminalState
    $restored = Read-JsonFile -Path $terminalPath
    Assert-Equal -Expected '{custom-profile}' -Actual $restored.defaultProfile -Message 'rollback deve restaurar perfil padrao anterior'
    Assert-Equal -Expected 95 -Actual $restored.profiles.defaults.opacity -Message 'rollback deve restaurar opacidade anterior'
    Assert-Equal -Expected $false -Actual $restored.profiles.defaults.elevate -Message 'rollback deve restaurar elevacao anterior'
    Assert-Equal -Expected 'light' -Actual $restored.theme -Message 'rollback deve preservar alteracao posterior do usuario'
    Assert-Equal -Expected 'customCopy' -Actual (@($restored.actions | Where-Object keys -eq 'ctrl+c')[0].command) -Message 'rollback deve restaurar atalho anterior'
    Assert-Equal -Expected 'newTab' -Actual (@($restored.actions | Where-Object keys -eq 'ctrl+t')[0].command) -Message 'rollback deve preservar atalho nao gerenciado'

    $jsoncPath = Join-Path $tempRoot 'settings-jsonc.json'
    Write-Utf8NoBomFile -Path $jsoncPath -Content "{ // comentario`n  `"profiles`": { `"defaults`": {}, },`n}"
    Merge-TerminalSettings -Path $jsoncPath | Out-Null
    $jsoncMerged = Read-JsonFile -Path $jsoncPath
    Assert-Equal -Expected 'Hack NF' -Actual $jsoncMerged.profiles.defaults.font.face -Message 'merge deve aceitar JSONC com comentario e virgula final'

    $unchangedPath = Join-Path $tempRoot 'settings-unchanged.json'
    $unchangedBackup = Join-Path $tempRoot 'settings-unchanged.original.json'
    Save-JsonFile -Path $unchangedPath -Value $originalSettings
    Copy-Item -LiteralPath $unchangedPath -Destination $unchangedBackup
    $unchangedMerge = Merge-TerminalSettings -Path $unchangedPath
    Restore-TerminalSettings -Path $unchangedPath -State ([pscustomobject]@{
        OriginalExisted = $true
        BackupPath = $unchangedBackup
        Snapshot = $unchangedMerge.Snapshot
        PostInstallHash = $unchangedMerge.PostInstallHash
    })
    Assert-Equal -Expected $originalSettings -Actual (Read-JsonFile -Path $unchangedPath) -Message 'rollback sem alteracao posterior deve restaurar o arquivo original completo'

    $invalidJsonPath = Join-Path $tempRoot 'invalid.json'
    Write-Utf8NoBomFile -Path $invalidJsonPath -Content '{ invalid json'
    $invalidFailed = $false
    try {
        Merge-TerminalSettings -Path $invalidJsonPath | Out-Null
    } catch {
        $invalidFailed = $true
    }
    Assert-True -Condition $invalidFailed -Message 'JSON invalido deve interromper o merge'

    foreach ($scriptPath in @(
        'powershell\user_profile.ps1',
        'installer\scripts\Common.ps1',
        'installer\scripts\Configure-PowerShellConfig.ps1',
        'installer\scripts\Install-PowerShellConfig.ps1',
        'installer\scripts\Uninstall-PowerShellConfig.ps1'
    )) {
        $tokens = $null
        $errors = $null
        [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $repoRoot $scriptPath), [ref]$tokens, [ref]$errors) | Out-Null
        Assert-True -Condition ($errors.Count -eq 0) -Message "script deve ter sintaxe valida: $scriptPath"
    }

    $profileSource = Get-Content -LiteralPath (Join-Path $repoRoot 'powershell\user_profile.ps1') -Raw
    Assert-True -Condition (-not ($profileSource -match 'Claude|contapessoal|contaempresa')) -Message 'perfil distribuido nao pode conter funcoes pessoais de contas Claude'
    Assert-True -Condition (-not ($profileSource -match 'Invoke-WebRequest|Install-Module|Install-PSResource')) -Message 'perfil distribuido nao pode instalar ou baixar dependencias na abertura'
    Assert-True -Condition (-not ($profileSource -match '\bj8\b|\bj21\b|JAVA_HOME')) -Message 'perfil distribuido nao pode referenciar aliases Java desativados'

    Get-Content -LiteralPath (Join-Path $repoRoot 'powershell\takuya.omp.json') -Raw | ConvertFrom-Json -ErrorAction Stop | Out-Null
    $script:Passed++
    $terminalFragment = Get-Content -LiteralPath (Join-Path $repoRoot 'installer\terminal-fragment.json') -Raw | ConvertFrom-Json -ErrorAction Stop
    Assert-Equal -Expected 'One Half Dark (modded)' -Actual $terminalFragment.schemes[0].name -Message 'fragmento deve fornecer o esquema configurado'

    foreach ($font in Get-FontDefinitions) {
        Assert-True -Condition (Test-Path -LiteralPath (Join-Path $repoRoot ('powershell\fonts\' + $font.File))) -Message "fonte obrigatoria ausente: $($font.File)"
    }

    $versionFile = Join-Path $repoRoot 'installer\version.nsh'
    $versionContent = Get-Content -LiteralPath $versionFile -Raw
    $versionMatch = [regex]::Match($versionContent, '!define\s+PRODUCT_VERSION\s+"(\d+\.\d+\.\d+)"')
    Assert-True -Condition $versionMatch.Success -Message 'version.nsh deve conter versao semantica'
    if (-not [string]::IsNullOrWhiteSpace($ExpectedVersion)) {
        Assert-Equal -Expected $ExpectedVersion -Actual $versionMatch.Groups[1].Value -Message 'tag e version.nsh devem coincidir'
    }

    $nsiContent = Get-Content -LiteralPath (Join-Path $repoRoot 'installer\PowerShellConfig.nsi') -Raw
    Assert-True -Condition ($nsiContent.Contains('SetCompressor zlib')) -Message 'NSIS deve usar zlib'
    Assert-True -Condition (-not $nsiContent.Contains('taskkill /F /IM java.exe')) -Message 'NSIS nao pode encerrar processos Java globais'
    Assert-True -Condition ($nsiContent.Contains('PowerShellConfig-Setup-${PRODUCT_VERSION}.exe')) -Message 'nome do artefato deve incluir versao'
    Assert-True -Condition ($nsiContent.Contains('RequestExecutionLevel user')) -Message 'instalador deve executar por usuario'
    Assert-True -Condition (([regex]::Matches($nsiContent, [regex]::Escape('RMDir /r "$INSTDIR"'))).Count -eq 1) -Message 'falha de instalacao deve preservar arquivos e backups para recuperacao'
    Assert-True -Condition (([regex]::Matches($nsiContent, 'File "\.\.\\powershell\\fonts\\Hack .*Windows Compatible\.ttf"')).Count -eq 4) -Message 'payload deve conter exatamente quatro fontes Hack NF Windows Compatible'
    Assert-True -Condition (-not $nsiContent.Contains('config-powershell\Modules')) -Message 'modulos legados versionados nao podem entrar no instalador'

    $workflowContent = Get-Content -LiteralPath (Join-Path $repoRoot '.github\workflows\release-windows.yml') -Raw
    Assert-True -Condition ($workflowContent.Contains('runs-on: windows-latest')) -Message 'workflow deve compilar no Windows'
    Assert-True -Condition (-not $workflowContent.Contains('ubuntu-latest')) -Message 'workflow nao deve criar job Linux'
    Assert-True -Condition ($workflowContent.Contains('PowerShellConfig-Setup-${{ steps.version.outputs.VERSION }}.exe.sha256')) -Message 'workflow deve publicar checksum'
    Assert-True -Condition (-not $workflowContent.Contains('workflow_dispatch:')) -Message 'workflow de release deve ser disparado somente por tags'

    Write-Host "OK: $script:Passed verificacoes passaram."
} finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
