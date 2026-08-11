param(
  [ValidateSet('x64', 'arm64')]
  [string]$Architecture = 'x64',
  [string]$ApplicationVersion = '0.1.0',
  [string]$RuntimeArchive,
  [string]$OutputDirectory = 'artifacts'
)

$ErrorActionPreference = 'Stop'
$releaseDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = Split-Path -Parent $releaseDirectory
$config = Get-Content -LiteralPath (Join-Path $releaseDirectory 'windows-portable.config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$runtime = $config.runtimeArchives.$Architecture
$expectedNodeVersion = [string]$config.nodeVersion
$expectedPnpmVersion = [string]$config.pnpmVersion
$artifactRoot = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $OutputDirectory))
$cacheRoot = Join-Path $artifactRoot '.runtime-cache'
$stagingRoot = Join-Path $artifactRoot ('.staging-' + [Guid]::NewGuid().ToString('N'))
$stagedRelease = Join-Path $stagingRoot 'ProjectManagerDashboard'
$finalName = "ProjectManagerDashboard-$ApplicationVersion-win-$Architecture"
$finalRelease = Join-Path $artifactRoot $finalName
$zipPath = "$finalRelease.zip"

function Invoke-Checked([string]$Description, [scriptblock]$Command) {
  Write-Host $Description -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$Description failed with exit code $LASTEXITCODE." }
}

try {
  if ($ApplicationVersion -notmatch '^[0-9A-Za-z][0-9A-Za-z._-]{0,39}$') {
    throw 'ApplicationVersion must contain only letters, numbers, dots, underscores, and hyphens.'
  }
  if ((& node -p "process.platform") -ne 'win32') {
    throw 'The final portable artifact must be built on Windows; macOS/Linux native dependencies cannot be relabeled.'
  }
  if ((& node -p "process.arch") -ne $Architecture) {
    throw "Build architecture must be $Architecture."
  }
  if ((& node -p "process.versions.node") -ne $expectedNodeVersion) {
    throw "Build Node version must be exactly $expectedNodeVersion."
  }
  if ((& pnpm --version) -ne $expectedPnpmVersion) {
    throw "pnpm version must be exactly $expectedPnpmVersion."
  }
  if (Test-Path -LiteralPath $finalRelease) { throw "Release directory already exists: $finalRelease" }
  if (Test-Path -LiteralPath $zipPath) { throw "Release archive already exists: $zipPath" }

  New-Item -ItemType Directory -Path $cacheRoot, $stagedRelease -Force | Out-Null
  if ([string]::IsNullOrWhiteSpace($RuntimeArchive)) {
    $RuntimeArchive = Join-Path $cacheRoot ([string]$runtime.filename)
    if (-not (Test-Path -LiteralPath $RuntimeArchive -PathType Leaf)) {
      Write-Host "Downloading pinned official Node runtime $expectedNodeVersion..." -ForegroundColor Cyan
      Invoke-WebRequest -UseBasicParsing -Uri ([string]$runtime.url) -OutFile $RuntimeArchive
    }
  }
  $RuntimeArchive = [IO.Path]::GetFullPath($RuntimeArchive)
  $archiveDigest = (Get-FileHash -LiteralPath $RuntimeArchive -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($archiveDigest -ne ([string]$runtime.sha256).ToLowerInvariant()) {
    throw "Node runtime archive hash mismatch: $RuntimeArchive"
  }

  Push-Location $repositoryRoot
  try {
    Invoke-Checked 'Installing frozen workspace dependencies' { pnpm install --frozen-lockfile }
    Invoke-Checked 'Running automated tests' { pnpm test }
    Invoke-Checked 'Running lint checks' { pnpm lint }
    Invoke-Checked 'Building application assets' { pnpm build }
    Invoke-Checked 'Deploying isolated production dependencies' {
      pnpm --filter @project-manager/api --prod deploy (Join-Path $stagedRelease 'app')
    }
  } finally {
    Pop-Location
  }

  $binaryLinks = Join-Path $stagedRelease 'app\node_modules\.bin'
  if (Test-Path -LiteralPath $binaryLinks) { Remove-Item -LiteralPath $binaryLinks -Recurse -Force }
  New-Item -ItemType Directory -Path (Join-Path $stagedRelease 'web') -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $repositoryRoot 'apps\web\dist') -Destination (Join-Path $stagedRelease 'web\dist') -Recurse
  New-Item -ItemType Directory -Path (Join-Path $stagedRelease 'launcher') -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $releaseDirectory 'windows\start-dashboard.cmd') -Destination (Join-Path $stagedRelease 'start-dashboard.cmd')
  Copy-Item -LiteralPath (Join-Path $releaseDirectory 'windows\stop-dashboard.cmd') -Destination (Join-Path $stagedRelease 'stop-dashboard.cmd')
  Copy-Item -LiteralPath (Join-Path $releaseDirectory 'windows\verify-release.cmd') -Destination (Join-Path $stagedRelease 'verify-release.cmd')
  Copy-Item -LiteralPath (Join-Path $releaseDirectory 'windows\launcher.mjs') -Destination (Join-Path $stagedRelease 'launcher\launcher.mjs')

  $expandedRuntime = Join-Path $stagingRoot 'expanded-runtime'
  Expand-Archive -LiteralPath $RuntimeArchive -DestinationPath $expandedRuntime
  $runtimeRoot = Join-Path $expandedRuntime ("node-v$expectedNodeVersion-win-$Architecture")
  $runtimeNode = Join-Path $runtimeRoot 'node.exe'
  if (-not (Test-Path -LiteralPath $runtimeNode -PathType Leaf)) { throw 'The Node archive has an unexpected structure.' }
  New-Item -ItemType Directory -Path (Join-Path $stagedRelease 'runtime') -Force | Out-Null
  Copy-Item -LiteralPath $runtimeNode -Destination (Join-Path $stagedRelease 'runtime\node.exe')
  Copy-Item -LiteralPath (Join-Path $runtimeRoot 'LICENSE') -Destination (Join-Path $stagedRelease 'runtime\LICENSE')

  $packagedNode = Join-Path $stagedRelease 'runtime\node.exe'
  $packagedRuntime = & $packagedNode -p "JSON.stringify({version:process.versions.node,platform:process.platform,architecture:process.arch})" | ConvertFrom-Json
  if ($packagedRuntime.version -ne $expectedNodeVersion -or $packagedRuntime.platform -ne 'win32' -or $packagedRuntime.architecture -ne $Architecture) {
    throw 'The embedded runtime does not match the pinned Windows target.'
  }
  Invoke-Checked 'Loading packaged native SQLite dependency' {
    & $packagedNode (Join-Path $stagedRelease 'app\scripts\verify-native-runtime.mjs')
  }

  $linkedEntry = Get-ChildItem -LiteralPath $stagedRelease -Force -Recurse | Where-Object {
    ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
  } | Select-Object -First 1
  if ($null -ne $linkedEntry) { throw "Portable release contains a link or junction: $($linkedEntry.FullName)" }

  $releaseInfo = @{
    format = 'project-manager-dashboard-release'
    version = 1
    application = @{
      name = [string]$config.applicationName
      version = $ApplicationVersion
    }
    target = @{
      platform = 'win32'
      architecture = $Architecture
    }
    runtime = @{
      nodeVersion = $expectedNodeVersion
      sourceArchive = [string]$runtime.filename
    }
    launcher = @{
      host = '127.0.0.1'
      port = [int]$config.port
      entrypoint = 'start-dashboard.cmd'
    }
    createdAt = [DateTime]::UtcNow.ToString('o')
  } | ConvertTo-Json -Depth 4
  [IO.File]::WriteAllText(
    (Join-Path $stagedRelease 'RELEASE-INFO.json'),
    $releaseInfo,
    (New-Object Text.UTF8Encoding($false))
  )
  Invoke-Checked 'Checking packaged launcher and required files' {
    & $packagedNode (Join-Path $stagedRelease 'launcher\launcher.mjs') --check
  }

  Move-Item -LiteralPath $stagedRelease -Destination $finalRelease
  Compress-Archive -LiteralPath $finalRelease -DestinationPath $zipPath -CompressionLevel Optimal
  Write-Host "Portable release created: $zipPath" -ForegroundColor Green
} finally {
  if (Test-Path -LiteralPath $stagingRoot) { Remove-Item -LiteralPath $stagingRoot -Recurse -Force }
}
