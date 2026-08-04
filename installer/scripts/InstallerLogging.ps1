Set-StrictMode -Version Latest

$script:InstallerLogPath = $null
$script:InstallerLatestLogPath = $null
$script:InstallerSessionId = $null
$script:CurrentInstallerStage = 'bootstrap'
$script:InstallerUtf8 = [System.Text.UTF8Encoding]::new($false)
$script:InstallerAnsiPattern = [char]27 + '\[[0-?]*[ -/]*[@-~]'

function Remove-InstallerLogControlSequences {
    param([AllowNull()]$Value)

    if ($null -eq $Value) {
        return ''
    }

    $text = $Value.ToString().Replace(([char]0).ToString(), '')
    return [regex]::Replace($text, $script:InstallerAnsiPattern, '')
}

function Initialize-InstallerLogging {
    param(
        [string]$LogPath,
        [string]$LatestLogPath,
        [string]$SessionId,
        [ValidateSet('install', 'uninstall')][string]$Operation = 'install',
        [switch]$ResetLatest
    )

    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    if ([string]::IsNullOrWhiteSpace($SessionId)) {
        $SessionId = '{0}-pid{1}' -f $timestamp, $PID
    }

    $logDirectory = Join-Path $env:LOCALAPPDATA 'PowerShellConfig\logs'
    if ([string]::IsNullOrWhiteSpace($LogPath)) {
        $LogPath = Join-Path $logDirectory ('{0}-{1}.log' -f $Operation, $SessionId)
    }
    if ([string]::IsNullOrWhiteSpace($LatestLogPath)) {
        $LatestLogPath = Join-Path $env:LOCALAPPDATA ('PowerShellConfig-{0}.log' -f $Operation)
    }

    foreach ($path in @($LogPath, $LatestLogPath)) {
        $parent = Split-Path -Parent $path
        if (-not [string]::IsNullOrWhiteSpace($parent)) {
            New-Item -ItemType Directory -Path $parent -Force | Out-Null
        }
        if (-not (Test-Path -LiteralPath $path)) {
            [System.IO.File]::WriteAllText($path, '', $script:InstallerUtf8)
        }
    }
    if ($ResetLatest) {
        [System.IO.File]::WriteAllText($LatestLogPath, '', $script:InstallerUtf8)
    }

    $script:InstallerLogPath = $LogPath
    $script:InstallerLatestLogPath = $LatestLogPath
    $script:InstallerSessionId = $SessionId

    try {
        [Console]::OutputEncoding = $script:InstallerUtf8
        $global:OutputEncoding = $script:InstallerUtf8
    } catch {
        # O logger continua funcional mesmo em hosts sem console associado.
    }

    return [pscustomobject]@{
        LogPath = $LogPath
        LatestLogPath = $LatestLogPath
        SessionId = $SessionId
    }
}

function Write-InstallerLog {
    param(
        [ValidateSet('DEBUG', 'INFO', 'WARN', 'ERROR')][string]$Level = 'INFO',
        [Parameter(Mandatory = $true)][string]$Stage,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Message,
        [switch]$NoConsole
    )

    if ([string]::IsNullOrWhiteSpace($script:InstallerLogPath)) {
        throw 'Initialize-InstallerLogging deve ser chamado antes de gravar o log.'
    }

    $cleanMessage = Remove-InstallerLogControlSequences -Value $Message
    $messageLines = @($cleanMessage -split '\r?\n')
    if ($messageLines.Count -eq 0) {
        $messageLines = @('')
    }

    foreach ($messageLine in $messageLines) {
        $line = '{0} [session={1}] [{2}] [{3}] {4}' -f (Get-Date).ToString('O'), $script:InstallerSessionId, $Level, $Stage, $messageLine
        foreach ($path in @($script:InstallerLogPath, $script:InstallerLatestLogPath) | Select-Object -Unique) {
            [System.IO.File]::AppendAllText($path, $line + [Environment]::NewLine, $script:InstallerUtf8)
        }
        if (-not $NoConsole) {
            Write-Host $line
        }
    }
}

function Invoke-InstallerLoggedStep {
    param(
        [Parameter(Mandatory = $true)][string]$Stage,
        [Parameter(Mandatory = $true)][scriptblock]$Action
    )

    $script:CurrentInstallerStage = $Stage
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    Write-InstallerLog -Stage $Stage -Message 'START'
    try {
        $result = & $Action
        $stopwatch.Stop()
        Write-InstallerLog -Stage $Stage -Message ('SUCCESS durationMs={0}' -f $stopwatch.ElapsedMilliseconds)
        return $result
    } catch {
        $stopwatch.Stop()
        Write-InstallerLog -Level 'ERROR' -Stage $Stage -Message ('FAILURE durationMs={0} message={1}' -f $stopwatch.ElapsedMilliseconds, $_.Exception.Message)
        throw
    }
}

function Invoke-InstallerNativeCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$ArgumentList = @(),
        [Parameter(Mandatory = $true)][string]$Stage,
        [string]$DisplayCommand,
        [switch]$OutputAlreadyLogged
    )

    $script:CurrentInstallerStage = $Stage
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $display = if ([string]::IsNullOrWhiteSpace($DisplayCommand)) { [System.IO.Path]::GetFileName($FilePath) } else { $DisplayCommand }
    Write-InstallerLog -Stage $Stage -Message "START command=$display"

    $previousPreference = $ErrorActionPreference
    $exitCode = $null
    try {
        $ErrorActionPreference = 'Continue'
        & $FilePath @ArgumentList 2>&1 | ForEach-Object {
            $outputLine = Remove-InstallerLogControlSequences -Value $_
            if ($OutputAlreadyLogged) {
                if ($outputLine -match '^\d{4}-\d{2}-\d{2}T.*\[session=') {
                    Write-Host $outputLine
                } else {
                    Write-InstallerLog -Stage "$Stage.output" -Message $outputLine
                }
            } else {
                Write-InstallerLog -Stage $Stage -Message $outputLine
            }
        }
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
        $stopwatch.Stop()
    }

    $level = if ($exitCode -eq 0) { 'INFO' } else { 'WARN' }
    Write-InstallerLog -Level $level -Stage $Stage -Message ('END exitCode={0} durationMs={1}' -f $exitCode, $stopwatch.ElapsedMilliseconds)
    return [int]$exitCode
}

function Write-InstallerErrorRecord {
    param(
        [Parameter(Mandatory = $true)][System.Management.Automation.ErrorRecord]$ErrorRecord,
        [string]$Stage = $script:CurrentInstallerStage
    )

    Write-InstallerLog -Level 'ERROR' -Stage $Stage -Message ('exceptionType={0}' -f $ErrorRecord.Exception.GetType().FullName)
    Write-InstallerLog -Level 'ERROR' -Stage $Stage -Message ('message={0}' -f $ErrorRecord.Exception.Message)
    Write-InstallerLog -Level 'ERROR' -Stage $Stage -Message ('fullyQualifiedErrorId={0}' -f $ErrorRecord.FullyQualifiedErrorId)
    Write-InstallerLog -Level 'ERROR' -Stage $Stage -Message ('category={0}' -f $ErrorRecord.CategoryInfo)

    if ($null -ne $ErrorRecord.InvocationInfo) {
        $invocation = $ErrorRecord.InvocationInfo
        Write-InstallerLog -Level 'ERROR' -Stage $Stage -Message ('source file={0} line={1} offset={2}' -f $invocation.ScriptName, $invocation.ScriptLineNumber, $invocation.OffsetInLine)
        if (-not [string]::IsNullOrWhiteSpace($invocation.Line)) {
            Write-InstallerLog -Level 'ERROR' -Stage $Stage -Message ('command={0}' -f $invocation.Line.Trim())
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($ErrorRecord.ScriptStackTrace)) {
        Write-InstallerLog -Level 'ERROR' -Stage $Stage -Message ('stack={0}' -f $ErrorRecord.ScriptStackTrace)
    }

    $inner = $ErrorRecord.Exception.InnerException
    $depth = 0
    while ($null -ne $inner -and $depth -lt 10) {
        Write-InstallerLog -Level 'ERROR' -Stage $Stage -Message ('innerException[{0}] type={1} message={2}' -f $depth, $inner.GetType().FullName, $inner.Message)
        $inner = $inner.InnerException
        $depth++
    }
}
