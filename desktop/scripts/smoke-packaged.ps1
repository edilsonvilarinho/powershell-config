param(
    [Parameter(Mandatory = $true)][string]$ExecutablePath,
    [Parameter(Mandatory = $true)][string]$RepositoryRoot
)

$ErrorActionPreference = 'Stop'
$resolvedExecutable = (Resolve-Path -LiteralPath $ExecutablePath).Path
$resolvedRepository = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$smokeRoot = Join-Path $env:TEMP ('powershell-config-desktop-smoke-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $smokeRoot 'config') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $resolvedRepository 'powershell\takuya.omp.json') -Destination (Join-Path $smokeRoot 'takuya.omp.json')
$settings = Get-Content -Raw (Join-Path $resolvedRepository 'powershell\settings.default.json') | ConvertFrom-Json
$settings.startup.enabled = $false
[System.IO.File]::WriteAllText(
    (Join-Path $smokeRoot 'config\settings.json'),
    ($settings | ConvertTo-Json -Depth 20),
    [System.Text.UTF8Encoding]::new($false)
)
$terminalPath = Join-Path $smokeRoot 'terminal-settings.json'
[System.IO.File]::WriteAllText(
    $terminalPath,
    '{"profiles":{"defaults":{}},"schemes":[{"name":"One Half Dark (modded)"}]}',
    [System.Text.UTF8Encoding]::new($false)
)

$env:POWERSHELL_CONFIG_ROOT = $smokeRoot
$env:POWERSHELL_CONFIG_TERMINAL_SETTINGS = $terminalPath
$env:POWERSHELL_CONFIG_DISABLE_STARTUP_SYNC = '1'
$smokeResultPath = Join-Path $smokeRoot 'renderer-result.json'
$env:POWERSHELL_CONFIG_SMOKE_RESULT = $smokeResultPath
$process = Start-Process -FilePath $resolvedExecutable -ArgumentList '--hidden' -WindowStyle Hidden -PassThru
try {
    if (-not $process.WaitForExit(15000)) {
        throw 'Aplicativo nao concluiu o smoke test do renderer em 15 segundos.'
    }
    if ($process.ExitCode -ne 0) {
        throw "Aplicativo encerrou com falha durante smoke test. ExitCode=$($process.ExitCode)"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $smokeRoot 'config\themes\active.omp.json'))) {
        throw 'Tema ativo nao foi inicializado.'
    }
    $userStatePath = Join-Path $smokeRoot 'config\user-state.json'
    if (-not (Test-Path -LiteralPath $userStatePath)) {
        throw 'Estado persistente do usuario nao foi inicializado.'
    }
    $userState = Get-Content -LiteralPath $userStatePath -Raw | ConvertFrom-Json
    if ($userState.schemaVersion -ne 1 -or @($userState.favoriteThemeIds | Where-Object { $null -ne $_ }).Count -ne 0) {
        throw 'Estado persistente do usuario foi inicializado fora do contrato.'
    }
    if (-not (Test-Path -LiteralPath $smokeResultPath)) {
        throw 'Renderer nao produziu resultado do smoke test.'
    }
    $rendererResult = Get-Content -LiteralPath $smokeResultPath -Raw | ConvertFrom-Json
    if (-not [bool]$rendererResult.apiReady -or -not [bool]$rendererResult.overviewReady) {
        throw "Renderer incompleto: $($rendererResult | ConvertTo-Json -Compress)"
    }

    Remove-Item Env:POWERSHELL_CONFIG_SMOKE_RESULT -ErrorAction SilentlyContinue
    $process = Start-Process -FilePath $resolvedExecutable -ArgumentList '--hidden' -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 2
    if ($process.HasExited) { throw 'Instancia principal encerrou antes do teste de segunda instancia.' }
    Start-Process -FilePath $resolvedExecutable -ArgumentList '--shutdown' -WindowStyle Hidden -Wait
    Start-Sleep -Milliseconds 700
    $process.Refresh()
    if (-not $process.HasExited) {
        throw 'Instancia principal nao encerrou cooperativamente.'
    }
    Write-Host "SMOKE_OK pid=$($process.Id)"
} finally {
    if (-not $process.HasExited) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
    Remove-Item Env:POWERSHELL_CONFIG_ROOT -ErrorAction SilentlyContinue
    Remove-Item Env:POWERSHELL_CONFIG_TERMINAL_SETTINGS -ErrorAction SilentlyContinue
    Remove-Item Env:POWERSHELL_CONFIG_DISABLE_STARTUP_SYNC -ErrorAction SilentlyContinue
    Remove-Item Env:POWERSHELL_CONFIG_SMOKE_RESULT -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $smokeRoot -Recurse -Force -ErrorAction SilentlyContinue
}
