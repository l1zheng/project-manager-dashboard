param(
  [Parameter(Mandatory = $true)]
  [string]$ArchivePath,
  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$archive = [IO.Path]::GetFullPath($ArchivePath)
$output = [IO.Path]::GetFullPath($OutputDirectory)
$extracted = Join-Path $output 'extracted'
$dataDirectory = Join-Path $output 'data'
$acceptanceOutput = Join-Path $output 'results'

function Invoke-Checked([string]$Description, [scriptblock]$Command) {
  Write-Host $Description -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$Description failed with exit code $LASTEXITCODE." }
}

if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) {
  throw "Portable archive was not found: $archive"
}
if (Test-Path -LiteralPath $output) {
  throw "Acceptance output directory already exists: $output"
}
New-Item -ItemType Directory -Path $extracted, $dataDirectory, $acceptanceOutput -Force | Out-Null
Expand-Archive -LiteralPath $archive -DestinationPath $extracted
$releaseRoots = @(Get-ChildItem -LiteralPath $extracted -Directory)
if ($releaseRoots.Count -ne 1) { throw 'Portable ZIP must contain exactly one release directory.' }
$releaseRoot = $releaseRoots[0].FullName
$packagedNode = Join-Path $releaseRoot 'runtime\node.exe'
$startCommand = Join-Path $releaseRoot 'start-dashboard.cmd'
$stopCommand = Join-Path $releaseRoot 'stop-dashboard.cmd'
$checkCommand = Join-Path $releaseRoot 'verify-release.cmd'
$acceptanceScript = Join-Path (Split-Path -Parent $PSScriptRoot) 'release\production-acceptance.mjs'
$browserAcceptanceScript = Join-Path (Split-Path -Parent $PSScriptRoot) 'release\browser-acceptance.mjs'

$env:PM_DATA_DIR = $dataDirectory
$env:PM_LAUNCHER_NO_BROWSER = '1'
$env:CI = 'true'

try {
  Invoke-Checked 'Checking portable release structure through its CMD entrypoint' { & $checkCommand }
  Invoke-Checked 'Starting the exact extracted portable release' { & $startCommand }
  $edgeCandidates = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
  )
  $edgePath = $edgeCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  if ([string]::IsNullOrWhiteSpace($edgePath)) { throw 'Microsoft Edge was not found on the Windows runner.' }
  $edgeProfile = Join-Path $output 'edge-profile'
  $edge = Start-Process -FilePath $edgePath -ArgumentList @(
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--remote-debugging-port=9222',
    "--user-data-dir=$edgeProfile",
    'http://127.0.0.1:4300/'
  ) -PassThru
  try {
    Invoke-Checked 'Running real-browser interaction journey in Microsoft Edge' {
      & $packagedNode $browserAcceptanceScript `
        --debug-url 'http://127.0.0.1:9222' `
        --output-dir $acceptanceOutput
    }
  } finally {
    if ($null -ne $edge -and -not $edge.HasExited) { Stop-Process -Id $edge.Id -Force }
  }
  Invoke-Checked 'Running complete production setup journey' {
    & $packagedNode $acceptanceScript `
      --base-url 'http://127.0.0.1:4300' `
      --phase setup `
      --output-dir $acceptanceOutput
  }
  Invoke-Checked 'Verifying repeat launch reuses the healthy service' { & $startCommand }
  Invoke-Checked 'Stopping the portable release' { & $stopCommand }
  Invoke-Checked 'Restarting the portable release with persisted data' { & $startCommand }
  Invoke-Checked 'Verifying all state and exports after restart' {
    & $packagedNode $acceptanceScript `
      --base-url 'http://127.0.0.1:4300' `
      --phase verify `
      --output-dir $acceptanceOutput
  }
} finally {
  & $stopCommand
}

Write-Host "Portable production acceptance passed: $acceptanceOutput" -ForegroundColor Green
