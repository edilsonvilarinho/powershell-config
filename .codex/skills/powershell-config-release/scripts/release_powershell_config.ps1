param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('patch', 'minor', 'major')]
    [string]$ReleaseType,

    [Parameter(Mandatory = $true)]
    [string]$RepoPath,

    [int]$WorkflowTimeoutMinutes = 25,

    [string]$WorkflowName = 'Release Windows Installer',

    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

if (-not (Test-Path -LiteralPath $RepoPath)) {
    throw "Repositorio nao encontrado: $RepoPath"
}

$resolvedRepoPath = (Resolve-Path -LiteralPath $RepoPath).Path
$safeDirectory = $resolvedRepoPath -replace '\\', '/'
$versionPath = Join-Path $resolvedRepoPath 'installer\version.nsh'
$desktopPackagePath = Join-Path $resolvedRepoPath 'desktop\package.json'
$desktopLockPath = Join-Path $resolvedRepoPath 'desktop\package-lock.json'
$testPath = Join-Path $resolvedRepoPath 'installer\scripts\Test-PowerShellConfig.ps1'
$script:LastExitCode = 0

function Format-ProcessArgument {
    param([Parameter(Mandatory = $true)][string]$Value)

    if ($Value.Length -eq 0) {
        return '""'
    }
    if ($Value -notmatch '[\s"]') {
        return $Value
    }
    return '"' + $Value.Replace('"', '\"') + '"'
}

function Invoke-NativeProcess {
    param(
        [Parameter(Mandatory = $true)][string]$FileName,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [switch]$IgnoreErrors
    )

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $FileName
    $startInfo.WorkingDirectory = $resolvedRepoPath
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.UseShellExecute = $false
    $startInfo.Arguments = (($Arguments | ForEach-Object { Format-ProcessArgument $_ }) -join ' ')

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    $process.Start() | Out-Null
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    $script:LastExitCode = $process.ExitCode

    $output = @()
    if (-not [string]::IsNullOrWhiteSpace($stdout)) {
        $output += $stdout -split "`r?`n"
    }
    if (-not [string]::IsNullOrWhiteSpace($stderr)) {
        $output += $stderr -split "`r?`n"
    }
    $output = @($output | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

    if (-not $IgnoreErrors -and $process.ExitCode -ne 0) {
        throw ($output -join [Environment]::NewLine)
    }
    return $output
}

function Invoke-Git {
    param([Parameter(Mandatory = $true)][string[]]$Arguments, [switch]$IgnoreErrors)

    $gitArguments = @('-c', "safe.directory=$safeDirectory", '-C', $resolvedRepoPath) + $Arguments
    return Invoke-NativeProcess -FileName 'git' -Arguments $gitArguments -IgnoreErrors:$IgnoreErrors
}

function Invoke-Gh {
    param([Parameter(Mandatory = $true)][string[]]$Arguments, [switch]$IgnoreErrors)

    return Invoke-NativeProcess -FileName 'gh' -Arguments $Arguments -IgnoreErrors:$IgnoreErrors
}

function Get-LocalConfigValue {
    param([Parameter(Mandatory = $true)][string]$Key)

    $output = Invoke-Git -Arguments @('config', '--file', '.git/config', '--get', $Key) -IgnoreErrors
    if ($script:LastExitCode -ne 0) {
        return $null
    }
    $value = ($output -join [Environment]::NewLine).Trim()
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $null
    }
    return $value
}

function Restore-LocalConfigValue {
    param([Parameter(Mandatory = $true)][string]$Key, [AllowNull()][string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        Invoke-Git -Arguments @('config', '--file', '.git/config', '--unset', $Key) -IgnoreErrors | Out-Null
    } else {
        Invoke-Git -Arguments @('config', '--file', '.git/config', $Key, $Value) | Out-Null
    }
}

function Write-Utf8NoBomFile {
    param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][string]$Content)

    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Get-NextVersion {
    param([Parameter(Mandatory = $true)][string]$CurrentVersion, [Parameter(Mandatory = $true)][string]$BumpType)

    $parts = $CurrentVersion.Split('.')
    if ($parts.Count -ne 3) {
        throw "Formato de versao sem suporte: $CurrentVersion"
    }
    $major = [int]$parts[0]
    $minor = [int]$parts[1]
    $patch = [int]$parts[2]
    switch ($BumpType) {
        'patch' { $patch++ }
        'minor' { $minor++; $patch = 0 }
        'major' { $major++; $minor = 0; $patch = 0 }
    }
    return "$major.$minor.$patch"
}

function Wait-ForWorkflowRun {
    param([Parameter(Mandatory = $true)][string]$TagName)

    $deadline = (Get-Date).ToUniversalTime().AddMinutes($WorkflowTimeoutMinutes)
    while ((Get-Date).ToUniversalTime() -lt $deadline) {
        $raw = Invoke-Gh -Arguments @(
            'run', 'list', '--workflow', $WorkflowName, '--limit', '20',
            '--json', 'databaseId,headBranch,status,conclusion,url,createdAt'
        )
        $runs = ($raw -join [Environment]::NewLine) | ConvertFrom-Json
        $match = $runs |
            Where-Object { $_.headBranch -eq $TagName } |
            Sort-Object { [DateTime]$_.createdAt } -Descending |
            Select-Object -First 1
        if ($null -ne $match) {
            return $match
        }
        Start-Sleep -Seconds 5
    }
    throw "Timeout aguardando workflow '$WorkflowName' para $TagName."
}

function Wait-ForRelease {
    param([Parameter(Mandatory = $true)][string]$TagName)

    $deadline = (Get-Date).ToUniversalTime().AddMinutes($WorkflowTimeoutMinutes)
    while ((Get-Date).ToUniversalTime() -lt $deadline) {
        $raw = Invoke-Gh -Arguments @('release', 'view', $TagName, '--json', 'tagName,url,assets') -IgnoreErrors
        if ($script:LastExitCode -eq 0) {
            return (($raw -join [Environment]::NewLine) | ConvertFrom-Json)
        }
        Start-Sleep -Seconds 5
    }
    throw "Timeout aguardando GitHub Release $TagName."
}

if (-not (Test-Path -LiteralPath $versionPath)) {
    throw "Arquivo de versao nao encontrado: $versionPath"
}
if (-not (Test-Path -LiteralPath $testPath)) {
    throw "Script de testes nao encontrado: $testPath"
}
if (-not (Test-Path -LiteralPath $desktopPackagePath) -or -not (Test-Path -LiteralPath $desktopLockPath)) {
    throw 'Manifests do aplicativo desktop nao foram encontrados.'
}

$originalName = Get-LocalConfigValue -Key 'user.name'
$originalEmail = Get-LocalConfigValue -Key 'user.email'
$identityChanged = $false

try {
    Write-Host '== Estado do repositorio =='
    Invoke-Git -Arguments @('status', '--short', '--branch')

    $branch = (Invoke-Git -Arguments @('rev-parse', '--abbrev-ref', 'HEAD') | Select-Object -Last 1).Trim()
    if ($branch -ne 'master') {
        throw "A release deve sair de master. Branch atual: $branch"
    }
    $porcelain = Invoke-Git -Arguments @('status', '--porcelain')
    if (($porcelain -join '').Trim().Length -gt 0) {
        throw 'A worktree nao esta limpa. Commit ou descarte as alteracoes antes da release.'
    }

    Invoke-Git -Arguments @('fetch', 'origin', 'master', '--tags') | Out-Null
    $localMaster = (Invoke-Git -Arguments @('rev-parse', 'master') | Select-Object -Last 1).Trim()
    $remoteMaster = (Invoke-Git -Arguments @('rev-parse', 'origin/master') | Select-Object -Last 1).Trim()
    if ($localMaster -ne $remoteMaster) {
        throw 'master nao esta alinhada com origin/master.'
    }
    Invoke-Gh -Arguments @('auth', 'status') | Out-Null

    Write-Host '== Testes =='
    $pwshCommand = Get-Command pwsh.exe -ErrorAction SilentlyContinue
    $testShell = if ($null -ne $pwshCommand) { $pwshCommand.Source } else { 'powershell.exe' }
    Invoke-NativeProcess -FileName $testShell -Arguments @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $testPath) |
        ForEach-Object { Write-Host $_ }

    $versionContent = Get-Content -LiteralPath $versionPath -Raw
    $versionMatch = [regex]::Match($versionContent, '!define\s+PRODUCT_VERSION\s+"(\d+\.\d+\.\d+)"')
    if (-not $versionMatch.Success) {
        throw 'Nao foi possivel localizar PRODUCT_VERSION em installer/version.nsh.'
    }
    $currentVersion = $versionMatch.Groups[1].Value
    $nextVersion = Get-NextVersion -CurrentVersion $currentVersion -BumpType $ReleaseType
    $releaseTag = "v$nextVersion"
    Write-Host "Versao atual: $currentVersion"
    Write-Host "Proxima versao: $nextVersion"

    if ($ValidateOnly) {
        Write-Host 'Validacao concluida. Nenhum arquivo, commit ou tag foi alterado.'
        return
    }

    if (((Invoke-Git -Arguments @('tag', '--list', $releaseTag) -IgnoreErrors) -join '').Trim().Length -gt 0) {
        throw "Tag local ja existe: $releaseTag"
    }
    if (((Invoke-Git -Arguments @('ls-remote', '--tags', 'origin', $releaseTag) -IgnoreErrors) -join '').Trim().Length -gt 0) {
        throw "Tag remota ja existe: $releaseTag"
    }

    $updatedVersion = [regex]::Replace(
        $versionContent,
        '!define\s+PRODUCT_VERSION\s+"\d+\.\d+\.\d+"',
        "!define PRODUCT_VERSION `"$nextVersion`"",
        1
    )
    Write-Utf8NoBomFile -Path $versionPath -Content $updatedVersion
    Invoke-NativeProcess -FileName 'npm.cmd' -Arguments @(
        'version', $nextVersion, '--no-git-tag-version', '--prefix', 'desktop'
    ) | Out-Null
    Invoke-Git -Arguments @('add', '--', 'installer/version.nsh', 'desktop/package.json', 'desktop/package-lock.json') | Out-Null

    $stagedFiles = @(Invoke-Git -Arguments @('diff', '--cached', '--name-only'))
    $expectedStagedFiles = @('desktop/package-lock.json', 'desktop/package.json', 'installer/version.nsh')
    $normalizedStagedFiles = @($stagedFiles | ForEach-Object { $_.Trim() } | Sort-Object)
    if ($normalizedStagedFiles.Count -ne $expectedStagedFiles.Count -or
        (Compare-Object -ReferenceObject $expectedStagedFiles -DifferenceObject $normalizedStagedFiles).Count -gt 0) {
        throw "Stage de release invalido: $($stagedFiles -join ', ')"
    }

    Invoke-Git -Arguments @('config', '--file', '.git/config', 'user.name', 'codex') | Out-Null
    Invoke-Git -Arguments @('config', '--file', '.git/config', 'user.email', 'codex@openai.com') | Out-Null
    $identityChanged = $true

    Invoke-Git -Arguments @('commit', '-m', "chore: bump version to $releaseTag")
    Invoke-Git -Arguments @('tag', '-a', $releaseTag, '-m', $releaseTag)

    Restore-LocalConfigValue -Key 'user.name' -Value $originalName
    Restore-LocalConfigValue -Key 'user.email' -Value $originalEmail
    $identityChanged = $false

    Write-Host '== Push atomico de master e tag =='
    Invoke-Git -Arguments @('push', '--atomic', 'origin', 'HEAD:master', $releaseTag)

    Write-Host '== Aguardando GitHub Actions =='
    $workflowRun = Wait-ForWorkflowRun -TagName $releaseTag
    Write-Host $workflowRun.url
    Invoke-Gh -Arguments @('run', 'watch', "$($workflowRun.databaseId)", '--exit-status')

    $release = Wait-ForRelease -TagName $releaseTag
    $expectedAssets = @(
        "PowerShellConfig-Setup-$nextVersion-win-x64.exe",
        "PowerShellConfig-Setup-$nextVersion-win-x64.exe.sha256",
        "PowerShellConfig-Setup-$nextVersion-win-arm64.exe",
        "PowerShellConfig-Setup-$nextVersion-win-arm64.exe.sha256"
    )
    $assetNames = @($release.assets | ForEach-Object { $_.name })
    $unexpectedAssets = @($assetNames | Where-Object { $expectedAssets -notcontains $_ })
    $missingAssets = @($expectedAssets | Where-Object { $assetNames -notcontains $_ })
    if ($missingAssets.Count -gt 0 -or $unexpectedAssets.Count -gt 0) {
        throw "Assets da release divergentes. Ausentes: $($missingAssets -join ', '). Inesperados: $($unexpectedAssets -join ', ')."
    }

    Write-Host "Release: $($release.url)"
    foreach ($asset in $release.assets | Where-Object { $expectedAssets -contains $_.name }) {
        Write-Host "- $($asset.name): $($asset.url)"
    }
} finally {
    if ($identityChanged) {
        Restore-LocalConfigValue -Key 'user.name' -Value $originalName
        Restore-LocalConfigValue -Key 'user.email' -Value $originalEmail
    }
}
