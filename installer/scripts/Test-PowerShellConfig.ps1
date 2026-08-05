param([string]$ExpectedVersion)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$commonPath = Join-Path $PSScriptRoot 'Common.ps1'
$loggingPath = Join-Path $PSScriptRoot 'InstallerLogging.ps1'
. $commonPath
. $loggingPath

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

function Get-DirectoryFingerprint {
    param([Parameter(Mandatory = $true)][string]$Path)

    $root = (Resolve-Path -LiteralPath $Path).Path
    $entries = Get-ChildItem -LiteralPath $root -File -Recurse | Sort-Object FullName | ForEach-Object {
        $relative = $_.FullName.Substring($root.Length).TrimStart('\')
        "$relative=$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash)"
    }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes(($entries -join "`n"))
    return [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($bytes))
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
            [pscustomobject]@{ command = 'globalSummon' },
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
    Assert-True -Condition (@($merged.actions | Where-Object command -eq 'globalSummon').Count -eq 1) -Message 'acao sem propriedade keys deve ser preservada'
    Assert-True -Condition (@($merged.actions | Where-Object { (Get-TerminalActionKey -Action $_) -eq 'ctrl+c' }).Count -eq 1) -Message 'atalho gerenciado nao pode ser duplicado'
    Merge-TerminalSettings -Path $terminalPath | Out-Null
    $mergedAgain = Read-JsonFile -Path $terminalPath
    Assert-True -Condition (@($mergedAgain.actions | Where-Object { (Get-TerminalActionKey -Action $_) -eq 'ctrl+c' }).Count -eq 1) -Message 'merge repetido deve permanecer idempotente'

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
    Assert-Equal -Expected 'customCopy' -Actual (@($restored.actions | Where-Object { (Get-TerminalActionKey -Action $_) -eq 'ctrl+c' })[0].command) -Message 'rollback deve restaurar atalho anterior'
    Assert-Equal -Expected 'newTab' -Actual (@($restored.actions | Where-Object { (Get-TerminalActionKey -Action $_) -eq 'ctrl+t' })[0].command) -Message 'rollback deve preservar atalho nao gerenciado'
    Assert-True -Condition (@($restored.actions | Where-Object command -eq 'globalSummon').Count -eq 1) -Message 'rollback deve preservar acao sem propriedade keys'

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

    $managedFileSource = Join-Path $tempRoot 'managed-file-source.txt'
    $managedFileTarget = Join-Path $tempRoot 'managed-file-target.txt'
    Write-Utf8NoBomFile -Path $managedFileSource -Content 'conteudo identico'
    Write-Utf8NoBomFile -Path $managedFileTarget -Content 'conteudo identico'
    $lockedTarget = [System.IO.File]::Open($managedFileTarget, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    try {
        $skipResult = Sync-ManagedFile -SourcePath $managedFileSource -TargetPath $managedFileTarget
        Assert-Equal -Expected 'Skip' -Actual $skipResult.Action -Message 'arquivo identico e bloqueado deve ser ignorado sem copia'
    } finally {
        $lockedTarget.Dispose()
    }

    Write-Utf8NoBomFile -Path $managedFileTarget -Content 'conteudo divergente preservado'
    $lockedTarget = [System.IO.File]::Open($managedFileTarget, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    $copyFailure = $null
    try {
        Sync-ManagedFile -SourcePath $managedFileSource -TargetPath $managedFileTarget | Out-Null
    } catch {
        $copyFailure = $_
    } finally {
        $lockedTarget.Dispose()
    }
    Assert-True -Condition ($null -ne $copyFailure) -Message 'arquivo divergente e bloqueado deve falhar explicitamente'
    Assert-True -Condition ($copyFailure.Exception.Message.Contains($managedFileSource) -and $copyFailure.Exception.Message.Contains($managedFileTarget)) -Message 'falha de copia deve identificar origem e destino'
    Assert-Equal -Expected 'conteudo divergente preservado' -Actual (Get-Content -LiteralPath $managedFileTarget -Raw) -Message 'falha de copia nao pode alterar o destino bloqueado'

    $pristineManaged = Join-Path $tempRoot 'pristine-managed.json'
    Write-Utf8NoBomFile -Path $pristineManaged -Content '{"a":1}'
    $pristineManagedHash = Get-FileSha256 -Path $pristineManaged
    Assert-True -Condition (Remove-ManagedFileIfPristine -Path $pristineManaged -InstalledHash $pristineManagedHash -OriginalExisted $false) -Message 'arquivo gerenciado intocado e criado pela instalacao deve ser removido no rollback'
    Assert-True -Condition (-not (Test-Path -LiteralPath $pristineManaged)) -Message 'arquivo removido no rollback nao pode permanecer no disco'

    $modifiedManaged = Join-Path $tempRoot 'modified-managed.json'
    Write-Utf8NoBomFile -Path $modifiedManaged -Content '{"a":1}'
    $modifiedManagedHash = Get-FileSha256 -Path $modifiedManaged
    Write-Utf8NoBomFile -Path $modifiedManaged -Content '{"a":2}'
    Assert-True -Condition (-not (Remove-ManagedFileIfPristine -Path $modifiedManaged -InstalledHash $modifiedManagedHash -OriginalExisted $false)) -Message 'arquivo alterado depois da instalacao nao pode ser removido no rollback'
    Assert-True -Condition (Test-Path -LiteralPath $modifiedManaged) -Message 'arquivo alterado deve permanecer no disco apos tentativa de rollback'

    $preexistingManaged = Join-Path $tempRoot 'preexisting-managed.json'
    Write-Utf8NoBomFile -Path $preexistingManaged -Content '{"a":1}'
    Assert-True -Condition (-not (Remove-ManagedFileIfPristine -Path $preexistingManaged -InstalledHash (Get-FileSha256 -Path $preexistingManaged) -OriginalExisted $true)) -Message 'arquivo que ja existia antes da instalacao nao pode ser removido no rollback'

    Assert-True -Condition (-not (Remove-ManagedFileIfPristine -Path (Join-Path $tempRoot 'ausente-managed.json') -InstalledHash 'qualquer' -OriginalExisted $false)) -Message 'arquivo ausente nao pode ser tratado como removido'

    $existingFontStates = @(
        [pscustomobject]@{ File = 'font-1.ttf'; InstalledHash = 'hash-1' },
        [pscustomobject]@{ File = 'font-2.ttf'; InstalledHash = 'hash-2' },
        [pscustomobject]@{ File = 'font-3.ttf'; InstalledHash = 'hash-3' },
        [pscustomobject]@{ File = 'font-4.ttf'; InstalledHash = 'hash-4' }
    )
    $updatedFontStates = @(Set-ManagedFontStateEntry -ExistingStates $existingFontStates -FontState ([pscustomobject]@{ File = 'font-2.ttf'; InstalledHash = 'hash-updated' }))
    Assert-Equal -Expected 4 -Actual $updatedFontStates.Count -Message 'atualizacao parcial de fonte deve preservar todas as entradas do estado'
    Assert-Equal -Expected 'hash-updated' -Actual (@($updatedFontStates | Where-Object File -eq 'font-2.ttf')[0].InstalledHash) -Message 'estado deve substituir somente a fonte processada'
    $recoveredFontStates = @(Set-ManagedFontStateEntry -ExistingStates @($existingFontStates[0]) -FontState $existingFontStates[1])
    Assert-Equal -Expected 2 -Actual $recoveredFontStates.Count -Message 'estado previamente truncado deve aceitar a proxima fonte sem perder a existente'

    $testLogPath = Join-Path $tempRoot 'logs\install-test-session.log'
    $testLatestLogPath = Join-Path $tempRoot 'PowerShellConfig-install.log'
    Initialize-InstallerLogging -LogPath $testLogPath -LatestLogPath $testLatestLogPath -SessionId 'test-session' -Operation install -ResetLatest | Out-Null
    $ansiEscape = [char]27
    Write-InstallerLog -Stage 'test.encoding' -Message "atualização disponível ${ansiEscape}[31merro${ansiEscape}[0m" -NoConsole
    try {
        throw [System.InvalidOperationException]::new('falha rastreavel')
    } catch {
        Write-InstallerErrorRecord -ErrorRecord $_ -Stage 'test.error'
    }
    $testLogContent = [System.IO.File]::ReadAllText($testLogPath, [System.Text.UTF8Encoding]::new($false))
    $testLatestLogContent = [System.IO.File]::ReadAllText($testLatestLogPath, [System.Text.UTF8Encoding]::new($false))
    $testLogBytes = [System.IO.File]::ReadAllBytes($testLogPath)
    Assert-True -Condition ($testLogContent.Contains('atualização disponível erro')) -Message 'log deve preservar UTF-8 e remover sequencias ANSI'
    Assert-True -Condition (-not $testLogContent.Contains($ansiEscape)) -Message 'log nao pode manter caracteres de escape ANSI'
    Assert-True -Condition ($testLogContent.Contains('exceptionType=System.InvalidOperationException') -and $testLogContent.Contains('source file=') -and $testLogContent.Contains('stack=')) -Message 'log de erro deve manter tipo, origem e stack'
    Assert-Equal -Expected $testLogContent -Actual $testLatestLogContent -Message 'arquivo mais recente deve espelhar o log da execucao'
    Assert-True -Condition (-not ($testLogBytes.Length -ge 3 -and $testLogBytes[0] -eq 0xEF -and $testLogBytes[1] -eq 0xBB -and $testLogBytes[2] -eq 0xBF)) -Message 'log deve usar UTF-8 sem BOM'

    foreach ($scriptPath in @(
        'powershell\user_profile.ps1',
        'installer\scripts\Common.ps1',
        'installer\scripts\Configure-PowerShellConfig.ps1',
        'installer\scripts\Install-PowerShellConfig.ps1',
        'installer\scripts\InstallerLogging.ps1',
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
    Assert-True -Condition ($profileSource.Contains("Join-Path `$PSScriptRoot 'config\custom-profile.ps1'")) -Message 'perfil deve carregar customizacoes somente pelo caminho gerenciado fixo'
    Assert-True -Condition ($profileSource.Contains('schemaVersion -notin @(1, 2, 3)')) -Message 'perfil deve aceitar settings migrados para schema v3'
    Assert-True -Condition ($profileSource.Contains('$global:PowerShellConfigCustomHelpEntries')) -Message 'helper deve consumir metadados das customizacoes geradas'
    foreach ($aliasName in @('g', 'vim', 'grep', 'tig', 'less', 'ls', 'dir', 'll')) {
        $registrationPattern = if ($aliasName -in @('ls', 'dir', 'll')) {
            'Add-PowerShellConfigHelpEntry\s+-Section\s+''Atalhos''\s+-Name\s+\$aliasName'
        } else {
            "Add-PowerShellConfigHelpEntry\s+-Section\s+'Atalhos'\s+-Name\s+'$aliasName'"
        }
        Assert-True -Condition ($profileSource -match $registrationPattern) -Message "ajuda deve ser registrada junto com o alias: $aliasName"
    }
    Assert-True -Condition (-not ($profileSource -match '\*\s*`tig`:\s*navegador Git')) -Message 'ajuda nao pode voltar a ter lista fixa de atalhos'
    Assert-True -Condition ($profileSource.Contains('$global:PowerShellConfigHelpEntries')) -Message 'ajuda deve ser montada a partir do registro da sessao'
    Assert-True -Condition ($profileSource -match '(?m)^function help \{') -Message 'perfil deve expor a ajuda pelo comando help'
    Assert-True -Condition ($profileSource.Contains('& $global:PowerShellConfigOriginalHelp @args')) -Message 'help com argumentos deve delegar ao Get-Help original'
    Assert-True -Condition ($profileSource.Contains("-notmatch 'Show-TerminalHelp'")) -Message 'captura do help original deve ignorar o proprio wrapper'
    Assert-True -Condition ($profileSource.Contains('Test-Path -LiteralPath $powerShellConfigCustomProfilePath -PathType Leaf')) -Message 'perfil deve validar o arquivo gerenciado antes do dot-source'

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

    $defaultSettings = Get-Content -LiteralPath (Join-Path $repoRoot 'powershell\settings.default.json') -Raw | ConvertFrom-Json -ErrorAction Stop
    Assert-Equal -Expected 3 -Actual $defaultSettings.schemaVersion -Message 'configuracao visual deve iniciar no schema v3'
    Assert-Equal -Expected 0 -Actual @($defaultSettings.customizations.aliases).Count -Message 'aliases personalizados devem iniciar vazios'
    Assert-Equal -Expected 0 -Actual @($defaultSettings.customizations.functions).Count -Message 'funcoes personalizadas devem iniciar vazias'
    Assert-Equal -Expected 0 -Actual @($defaultSettings.customizations.commands).Count -Message 'comandos personalizados devem iniciar vazios'
    Assert-Equal -Expected $true -Actual $defaultSettings.startup.enabled -Message 'aplicativo deve iniciar com Windows por padrao'
    Assert-Equal -Expected 'builtin:takuya' -Actual $defaultSettings.prompt.themeId -Message 'takuya deve permanecer o tema inicial'
    Assert-Equal -Expected 80 -Actual $defaultSettings.terminal.opacity -Message 'configuracao visual deve refletir opacidade inicial do instalador'

    $desktopPackage = Get-Content -LiteralPath (Join-Path $repoRoot 'desktop\package.json') -Raw | ConvertFrom-Json -ErrorAction Stop
    Assert-Equal -Expected $versionMatch.Groups[1].Value -Actual $desktopPackage.version -Message 'versao base do desktop e version.nsh devem permanecer alinhadas'
    Assert-True -Condition (Test-Path -LiteralPath (Join-Path $repoRoot 'desktop\package-lock.json')) -Message 'desktop deve possuir lockfile npm'
    Assert-True -Condition (Test-Path -LiteralPath (Join-Path $repoRoot 'desktop\assets\icon.ico')) -Message 'desktop deve possuir icone Windows'

    $nsiContent = Get-Content -LiteralPath (Join-Path $repoRoot 'installer\PowerShellConfig.nsi') -Raw
    Assert-True -Condition ($nsiContent.Contains('SetCompressor zlib')) -Message 'NSIS deve usar zlib'
    Assert-True -Condition (-not $nsiContent.Contains('taskkill /F /IM java.exe')) -Message 'NSIS nao pode encerrar processos Java globais'
    Assert-True -Condition (-not ($nsiContent -match '(?i)\b(?:taskkill|Stop-Process)\b.*WindowsTerminal')) -Message 'NSIS nao pode encerrar o Windows Terminal automaticamente'
    Assert-True -Condition ($nsiContent.Contains('PowerShellConfig-Setup-${PRODUCT_VERSION}-win-${TARGET_ARCH}.exe')) -Message 'nome do artefato deve incluir versao e arquitetura'
    Assert-True -Condition ($nsiContent.Contains('File /r "${DESKTOP_PAYLOAD_DIR}\*.*"')) -Message 'payload Electron deve entrar no instalador NSIS principal'
    Assert-True -Condition ($nsiContent.Contains('File "scripts\InstallerLogging.ps1"')) -Message 'logger compartilhado deve entrar no payload do instalador'
    Assert-True -Condition ($nsiContent.Contains('-LogPath "$InstallLogPath" -LatestLogPath "$LatestInstallLogPath" -SessionId "$InstallSessionId"')) -Message 'NSIS deve propagar a sessao de log ao PowerShell'
    Assert-True -Condition ($nsiContent.Contains('logs\install-$InstallSessionId.log')) -Message 'NSIS deve criar um log separado por execucao'
    Assert-True -Condition ($nsiContent.Contains('Function WriteInstallLog')) -Message 'NSIS deve registrar suas proprias etapas no log operacional'
    Assert-True -Condition ($nsiContent.Contains('--sync-startup')) -Message 'instalacao nova deve sincronizar a preferencia de inicializacao'
    Assert-True -Condition ($nsiContent.Contains('Var IsUpgrade')) -Message 'NSIS deve manter modo explicito para instalacao nova e upgrade'
    Assert-True -Condition ($nsiContent.Contains('IfFileExists "$INSTDIR\state\install-state.json" existingInstallDetected installModeDetected')) -Message 'upgrade deve ser detectado somente pelo estado gravado por uma instalacao concluida, nunca por residuo parcial'
    Assert-True -Condition (-not ($nsiContent -match 'IfFileExists\s+"\$INSTDIR\\app\\\*\.\*"\s+existingInstallDetected')) -Message 'residuo parcial de app nao pode por si so marcar upgrade (instalacao anterior incompleta deve ser reconfigurada, nao pulada)'
    Assert-True -Condition (-not ($nsiContent -match 'IfFileExists\s+"\$INSTDIR\\config\\\*\.\*"\s+existingInstallDetected')) -Message 'residuo parcial de config nao pode por si so marcar upgrade (instalacao anterior incompleta deve ser reconfigurada, nao pulada)'
    Assert-True -Condition ($nsiContent.Contains('SKIP upgrade; config state backups perfil terminal fontes modulos e startup preservados')) -Message 'upgrade deve registrar explicitamente a preservacao do ambiente'
    Assert-True -Condition ($nsiContent.Contains('SetOutPath "$INSTDIR\app.update"')) -Message 'novo aplicativo deve ser extraido em staging separado'
    $appPayloadReadyIndex = $nsiContent.IndexOf('appPayloadReady:', [StringComparison]::Ordinal)
    $appSwapBackupIndex = $nsiContent.IndexOf('Rename "$INSTDIR\app" "$INSTDIR\app.previous"', [StringComparison]::Ordinal)
    $safeSwapOutPathIndex = $nsiContent.IndexOf('SetOutPath "$INSTDIR"', $appPayloadReadyIndex, [StringComparison]::Ordinal)
    Assert-True -Condition ($appPayloadReadyIndex -ge 0 -and $safeSwapOutPathIndex -gt $appPayloadReadyIndex -and $safeSwapOutPathIndex -lt $appSwapBackupIndex) -Message 'swap deve sair de app.update antes de renomear os diretorios no Windows'
    Assert-True -Condition ($nsiContent.Contains('Rename "$INSTDIR\app" "$INSTDIR\app.previous"')) -Message 'aplicativo anterior deve ser preservado antes do swap'
    Assert-True -Condition ($nsiContent.Contains('Rename "$INSTDIR\app.previous" "$INSTDIR\app"')) -Message 'falha no swap deve restaurar o aplicativo anterior'
    foreach ($protectedDirectory in @('config', 'state', 'backups')) {
        Assert-True -Condition (-not $nsiContent.Contains('RMDir /r "$INSTDIR\' + $protectedDirectory + '"')) -Message "upgrade nao pode remover o diretorio protegido $protectedDirectory"
    }

    $upgradeFixture = Join-Path $tempRoot 'upgrade-fixture'
    foreach ($directory in @('app', 'app.update', 'config', 'state', 'backups')) {
        New-Item -ItemType Directory -Path (Join-Path $upgradeFixture $directory) -Force | Out-Null
    }
    Write-Utf8NoBomFile -Path (Join-Path $upgradeFixture 'app\PowerShell Config.exe') -Content 'app-anterior'
    Write-Utf8NoBomFile -Path (Join-Path $upgradeFixture 'app.update\PowerShell Config.exe') -Content 'app-novo'
    Write-Utf8NoBomFile -Path (Join-Path $upgradeFixture 'config\settings.json') -Content '{"usuario":"preservado"}'
    Write-Utf8NoBomFile -Path (Join-Path $upgradeFixture 'state\install-state.json') -Content '{"estado":"preservado"}'
    Write-Utf8NoBomFile -Path (Join-Path $upgradeFixture 'backups\backup.txt') -Content 'backup-preservado'
    $protectedBefore = @{}
    foreach ($directory in @('config', 'state', 'backups')) {
        $protectedBefore[$directory] = Get-DirectoryFingerprint -Path (Join-Path $upgradeFixture $directory)
    }
    $resolvedUpgradeFixture = (Resolve-Path -LiteralPath $upgradeFixture).Path
    Assert-True -Condition ($resolvedUpgradeFixture.StartsWith((Resolve-Path -LiteralPath $tempRoot).Path, [StringComparison]::OrdinalIgnoreCase)) -Message 'fixture de upgrade deve permanecer dentro do diretorio temporario'
    Move-Item -LiteralPath (Join-Path $upgradeFixture 'app') -Destination (Join-Path $upgradeFixture 'app.previous')
    Move-Item -LiteralPath (Join-Path $upgradeFixture 'app.update') -Destination (Join-Path $upgradeFixture 'app')
    foreach ($directory in @('config', 'state', 'backups')) {
        Assert-Equal -Expected $protectedBefore[$directory] -Actual (Get-DirectoryFingerprint -Path (Join-Path $upgradeFixture $directory)) -Message "swap de upgrade deve preservar hash de $directory"
    }
    Assert-Equal -Expected 'app-novo' -Actual (Get-Content -LiteralPath (Join-Path $upgradeFixture 'app\PowerShell Config.exe') -Raw).Trim() -Message 'swap de upgrade deve ativar apenas o novo aplicativo'
    Assert-True -Condition ($nsiContent.Contains('RequestExecutionLevel user')) -Message 'instalador deve executar por usuario'
    Assert-True -Condition (([regex]::Matches($nsiContent, '(?im)^\s*nsExec::ExecToLog.*(?:powershell|pwsh)\.exe')).Count -eq 4) -Message 'scripts PowerShell de instalacao e desinstalacao devem executar sem abrir console'
    Assert-True -Condition (-not ($nsiContent -match '(?im)^\s*ExecWait.*(?:powershell|pwsh)\.exe')) -Message 'NSIS nao pode usar ExecWait diretamente para scripts PowerShell'
    Assert-True -Condition ($nsiContent.Contains('Function EnsureWindowsTerminalClosed')) -Message 'NSIS deve validar Windows Terminal antes da extracao'
    Assert-True -Condition ($nsiContent.Contains('Call EnsureWindowsTerminalClosed')) -Message 'preflight do Windows Terminal deve executar no onInit'
    Assert-True -Condition ($nsiContent.Contains('MB_RETRYCANCEL')) -Message 'preflight interativo deve permitir tentar novamente ou cancelar'
    Assert-True -Condition ($nsiContent.Contains('IfSilent windowsTerminalRunningSilent windowsTerminalRunningInteractive')) -Message 'preflight deve tratar instalacao silenciosa sem dialogo'
    Assert-True -Condition ($nsiContent.Contains('SetErrorLevel 10')) -Message 'Windows Terminal aberto deve retornar erro no modo silencioso'
    Assert-True -Condition (([regex]::Matches($nsiContent, [regex]::Escape('RMDir /r "$INSTDIR"'))).Count -eq 1) -Message 'falha de instalacao deve preservar arquivos e backups para recuperacao'
    Assert-True -Condition (([regex]::Matches($nsiContent, 'File "\.\.\\powershell\\fonts\\Hack .*Windows Compatible\.ttf"')).Count -eq 4) -Message 'payload deve conter exatamente quatro fontes Hack NF Windows Compatible'
    Assert-True -Condition (-not $nsiContent.Contains('config-powershell\Modules')) -Message 'modulos legados versionados nao podem entrar no instalador'

    $installScriptContent = Get-Content -LiteralPath (Join-Path $repoRoot 'installer\scripts\Install-PowerShellConfig.ps1') -Raw
    Assert-True -Condition ($installScriptContent.Contains('Get-Process -Name WindowsTerminal')) -Message 'script de instalacao deve manter validacao defensiva contra corrida apos o preflight'
    $configureScriptContent = Get-Content -LiteralPath (Join-Path $repoRoot 'installer\scripts\Configure-PowerShellConfig.ps1') -Raw
    Assert-True -Condition ($configureScriptContent.Contains('SKIP arquivo identico; copia nao executada')) -Message 'configuracao deve evitar sobrescrever fonte identica'
    Assert-True -Condition ($configureScriptContent.Contains('$primaryError = $_')) -Message 'configuracao deve preservar a falha primaria antes do rollback'
    Assert-True -Condition ($configureScriptContent.Contains('rollbackExitCode')) -Message 'configuracao deve registrar o codigo de saida do rollback'
    Assert-True -Condition ($configureScriptContent.Contains("SKIP upgrade detectado; estado gerenciado anterior preservado")) -Message 'falha de upgrade nao pode executar rollback integral da instalacao anterior'
    Assert-True -Condition ($configureScriptContent.Contains('$state.ManagedConfig')) -Message 'configuracao deve rastrear o estado gerenciado de config/settings.json e tema para permitir rollback simetrico'

    $uninstallScriptContent = Get-Content -LiteralPath (Join-Path $repoRoot 'installer\scripts\Uninstall-PowerShellConfig.ps1') -Raw
    Assert-True -Condition ($uninstallScriptContent.Contains('Remove-ManagedFileIfPristine')) -Message 'rollback de instalacao nova deve remover config/settings.json e tema somente se intocados desde a instalacao'

    $workflowContent = Get-Content -LiteralPath (Join-Path $repoRoot '.github\workflows\release-windows.yml') -Raw
    Assert-True -Condition ($workflowContent.Contains('runs-on: windows-latest')) -Message 'workflow deve compilar no Windows'
    Assert-True -Condition (-not $workflowContent.Contains('ubuntu-latest')) -Message 'workflow nao deve criar job Linux'
    Assert-True -Condition ($workflowContent.Contains('PowerShellConfig-Setup-${{ steps.version.outputs.VERSION }}-win-x64.exe.sha256')) -Message 'workflow deve publicar checksum x64'
    Assert-True -Condition ($workflowContent.Contains('PowerShellConfig-Setup-${{ steps.version.outputs.VERSION }}-win-arm64.exe.sha256')) -Message 'workflow deve publicar checksum ARM64'
    Assert-True -Condition ($workflowContent.Contains('npm ci')) -Message 'workflow deve instalar dependencias Electron por lockfile'
    Assert-True -Condition ($workflowContent.Contains('smoke-packaged.ps1')) -Message 'workflow deve executar smoke test do Electron empacotado'
    Assert-True -Condition (-not $workflowContent.Contains('workflow_dispatch:')) -Message 'workflow de release deve ser disparado somente por tags'

    Write-Host "OK: $script:Passed verificacoes passaram."
} finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
