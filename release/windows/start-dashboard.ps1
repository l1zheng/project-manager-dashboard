param(
  [Parameter(Mandatory = $true)]
  [string]$ReleaseRoot,
  [switch]$StopOnly
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($ReleaseRoot).TrimEnd('\')
$manifest = Get-Content -LiteralPath (Join-Path $root 'RELEASE-MANIFEST.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$nodePath = Join-Path $root 'runtime\node.exe'
$serverPath = Join-Path $root 'app\dist\server.js'
$webPath = Join-Path $root 'web\dist'
$address = "127.0.0.1:$($manifest.launcher.port)"
$baseUrl = "http://$address"
$healthUrl = "$baseUrl/api/health"
$shutdownUrl = "$baseUrl/api/runtime/shutdown"
$dataRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'ProjectManagerDashboard'
$logsDirectory = Join-Path $dataRoot 'logs'
$statePath = Join-Path $dataRoot 'launcher-state.json'

function Get-DashboardHealth {
  try {
    $health = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 2
    if ($health.service -ne 'project-manager-api') { throw 'The configured port belongs to another service.' }
    return $health
  } catch {
    if ($_.Exception.Message -like '*another service*') { throw }
    return $null
  }
}

function Read-LauncherState {
  if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) { return $null }
  try {
    return Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Stop-Dashboard {
  $state = Read-LauncherState
  if ($null -eq $state -or ([string]$state.launchToken) -notmatch '^[0-9a-f]{64}$') {
    throw "The running dashboard cannot be authenticated for a clean stop. Close its Node process, then retry. State file: $statePath"
  }
  Invoke-RestMethod -Uri $shutdownUrl -Method Post -TimeoutSec 5 -Headers @{
    'x-project-manager-launch-token' = [string]$state.launchToken
  } | Out-Null
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 250
    if ($null -eq (Get-DashboardHealth)) { return }
  }
  throw 'The running dashboard did not stop within 10 seconds.'
}

function New-LaunchToken {
  $bytes = New-Object byte[] 32
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

function Write-LauncherState($process, [string]$token) {
  $state = @{
    version = 1
    processId = $process.Id
    applicationVersion = [string]$manifest.application.version
    executablePath = $nodePath
    releaseRoot = $root
    launchToken = $token
    startedAt = [DateTime]::UtcNow.ToString('o')
  } | ConvertTo-Json
  $temporaryPath = "$statePath.tmp"
  [IO.File]::WriteAllText($temporaryPath, $state, (New-Object Text.UTF8Encoding($false)))
  Move-Item -LiteralPath $temporaryPath -Destination $statePath -Force
}

try {
  New-Item -ItemType Directory -Path $logsDirectory -Force | Out-Null
  $health = Get-DashboardHealth
  if ($StopOnly) {
    if ($null -eq $health) {
      Write-Host 'Project Manager Dashboard is not running.'
      exit 0
    }
    Stop-Dashboard
    Write-Host 'Project Manager Dashboard stopped.' -ForegroundColor Green
    exit 0
  }

  if ($null -ne $health) {
    $state = Read-LauncherState
    if ($null -eq $state) {
      throw "Port $address is already used by an unmanaged or older dashboard service. Close the old Node process, then run start-dashboard.cmd again."
    }
    $differentRelease = [string]$state.releaseRoot -ne $root -or [string]$state.executablePath -ne $nodePath
    $restorePending = $health.storage.restorePending -eq $true
    $differentVersion = $null -ne $state -and [string]$state.applicationVersion -ne [string]$manifest.application.version
    if ($restorePending -or $differentVersion -or $differentRelease) {
      Write-Host 'Restarting the local service to apply a restore or application update...'
      Stop-Dashboard
    } else {
      Start-Process $baseUrl
      exit 0
    }
  }

  if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf)) { throw "Embedded Node runtime is missing: $nodePath" }
  if (-not (Test-Path -LiteralPath $serverPath -PathType Leaf)) { throw "Application server is missing: $serverPath" }
  if (-not (Test-Path -LiteralPath (Join-Path $webPath 'index.html') -PathType Leaf)) { throw "Web build is missing: $webPath" }

  $launchToken = New-LaunchToken
  $stamp = [DateTime]::Now.ToString('yyyyMMdd-HHmmss')
  $standardLog = Join-Path $logsDirectory "server-$stamp.log"
  $errorLog = Join-Path $logsDirectory "server-$stamp.error.log"
  $env:NODE_ENV = 'production'
  $env:PM_HOST = '127.0.0.1'
  $env:PM_API_PORT = [string]$manifest.launcher.port
  $env:PM_APP_VERSION = [string]$manifest.application.version
  $env:PM_DATA_DIR = $dataRoot
  $env:PM_WEB_DIST_DIR = $webPath
  $env:PM_LAUNCH_TOKEN = $launchToken
  $serverArgument = '"{0}"' -f $serverPath
  $process = Start-Process -FilePath $nodePath -ArgumentList $serverArgument -WorkingDirectory $root -RedirectStandardOutput $standardLog -RedirectStandardError $errorLog -PassThru
  Write-LauncherState $process $launchToken

  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    Start-Sleep -Milliseconds 250
    $process.Refresh()
    if ($process.HasExited) {
      $details = if (Test-Path -LiteralPath $errorLog) { Get-Content -LiteralPath $errorLog -Raw -Encoding UTF8 } else { '' }
      throw "The local service exited before becoming ready. $details"
    }
    if ($null -ne (Get-DashboardHealth)) {
      Start-Process $baseUrl
      Write-Host "Project Manager Dashboard is ready at $baseUrl" -ForegroundColor Green
      exit 0
    }
  }
  throw "The local service did not become ready within 30 seconds. Logs: $standardLog and $errorLog"
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
