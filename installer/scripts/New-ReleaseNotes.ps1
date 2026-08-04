param(
    [Parameter(Mandatory = $true)][string]$CurrentTag,
    [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

git rev-parse --verify $CurrentTag *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Tag atual nao encontrada: $CurrentTag"
}

$previousTag = git describe --tags --abbrev=0 --match 'v[0-9]*.[0-9]*.[0-9]*' "$CurrentTag^" 2>$null
if ($LASTEXITCODE -ne 0 -or $previousTag -notmatch '^v\d+\.\d+\.\d+$') {
    $previousTag = $null
}

$range = if ($null -ne $previousTag) { "$previousTag..$CurrentTag" } else { $CurrentTag }
$commits = @(git log --no-merges --reverse --pretty='%s|%h' $range)
if ($LASTEXITCODE -ne 0) {
    throw "Falha ao listar commits para o intervalo: $range"
}
$releaseCommit = "chore: bump version to $CurrentTag"
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('## Changes')
$lines.Add('')

if ($null -ne $previousTag) {
    $repository = $env:GITHUB_REPOSITORY
    $lines.Add("- Compare: [$previousTag...$CurrentTag](https://github.com/$repository/compare/$previousTag...$CurrentTag)")
    $lines.Add('')
}

foreach ($commit in $commits) {
    $parts = $commit -split '\|', 2
    if ($parts.Count -ne 2 -or $parts[0] -eq $releaseCommit) {
        continue
    }
    $lines.Add("- $($parts[0]) (``$($parts[1])``)")
}

if ($lines.Count -le 2) {
    $lines.Add('- No user-facing commits were detected.')
}

$parent = Split-Path -Parent $OutputPath
if (-not [string]::IsNullOrWhiteSpace($parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
}
[System.IO.File]::WriteAllLines($OutputPath, $lines, [System.Text.UTF8Encoding]::new($false))
