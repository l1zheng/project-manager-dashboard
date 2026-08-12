param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,
  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$installer = [IO.Path]::GetFullPath($InstallerPath)
$output = [IO.Path]::GetFullPath($OutputDirectory)
$installDirectory = Join-Path $output 'installed'
$dataDirectory = Join-Path $output 'data'
$acceptanceOutput = Join-Path $output 'results'
$installLog = Join-Path $output 'install.log'
$upgradeLog = Join-Path $output 'upgrade.log'
$uninstallLog = Join-Path $output 'uninstall.log'
$application = Join-Path $installDirectory 'ProjectManagerDashboard.exe'
$packagedNode = Join-Path $installDirectory 'runtime\node.exe'
$acceptanceScript = Join-Path $PSScriptRoot 'production-acceptance.mjs'

function Invoke-Launcher([string]$Description, [string]$Command) {
  Write-Host $Description -ForegroundColor Cyan
  $process = Start-Process -FilePath $application -ArgumentList $Command -PassThru
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) { throw "$Description failed with exit code $($process.ExitCode)." }
}

function Invoke-Checked([string]$Description, [scriptblock]$Command) {
  Write-Host $Description -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$Description failed with exit code $LASTEXITCODE." }
}

if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) { throw "Installer was not found: $installer" }
if (Test-Path -LiteralPath $output) { throw "Acceptance output directory already exists: $output" }
New-Item -ItemType Directory -Path $output, $dataDirectory, $acceptanceOutput -Force | Out-Null

$env:PM_DATA_DIR = $dataDirectory
$env:PM_LAUNCHER_NO_BROWSER = '1'
$env:PM_LAUNCHER_NO_DIALOGS = '1'
$env:CI = 'true'
$installed = $false

try {
  Write-Host 'Installing into an isolated current-user directory...' -ForegroundColor Cyan
  $install = Start-Process -FilePath $installer -ArgumentList @(
    '/VERYSILENT',
    '/SUPPRESSMSGBOXES',
    '/NORESTART',
    '/TASKS=""',
    "/DIR=$installDirectory",
    "/LOG=$installLog"
  ) -Wait -PassThru
  if ($install.ExitCode -ne 0) { throw "Installer failed with exit code $($install.ExitCode)." }
  $installed = $true
  if (-not (Test-Path -LiteralPath $application -PathType Leaf)) { throw 'Installed launcher is missing.' }
  if (-not (Test-Path -LiteralPath $packagedNode -PathType Leaf)) { throw 'Installed runtime is missing.' }

  Invoke-Launcher 'Checking the installed package through the native launcher' '--check'
  Invoke-Launcher 'Starting the installed application without a console' '--start'
  Invoke-Checked 'Running complete production setup journey against the installed application' {
    & $packagedNode $acceptanceScript `
      --base-url 'http://127.0.0.1:4300' `
      --phase setup `
      --output-dir $acceptanceOutput
  }
  Invoke-Launcher 'Verifying repeat launch reuses the healthy service' '--start'

  Write-Host 'Upgrading in place while the installed service is running...' -ForegroundColor Cyan
  $upgrade = Start-Process -FilePath $installer -ArgumentList @(
    '/VERYSILENT',
    '/SUPPRESSMSGBOXES',
    '/NORESTART',
    '/TASKS=""',
    "/DIR=$installDirectory",
    "/LOG=$upgradeLog"
  ) -Wait -PassThru
  if ($upgrade.ExitCode -ne 0) { throw "In-place upgrade failed with exit code $($upgrade.ExitCode)." }
  if (-not (Test-Path -LiteralPath $application -PathType Leaf)) { throw 'Launcher is missing after upgrade.' }
  Invoke-Launcher 'Starting the upgraded application with persisted data' '--start'
  Invoke-Checked 'Verifying all state and exports after in-place upgrade' {
    & $packagedNode $acceptanceScript `
      --base-url 'http://127.0.0.1:4300' `
      --phase verify `
      --output-dir $acceptanceOutput
  }
  Invoke-Launcher 'Stopping the upgraded application' '--stop'
  Invoke-Launcher 'Restarting the upgraded application' '--start'
  Invoke-Checked 'Verifying persisted state after the upgraded application restarts' {
    & $packagedNode $acceptanceScript `
      --base-url 'http://127.0.0.1:4300' `
      --phase verify `
      --output-dir $acceptanceOutput
  }
  Invoke-Launcher 'Stopping before uninstall' '--stop'

  $uninstaller = Get-ChildItem -LiteralPath $installDirectory -Filter 'unins*.exe' -File | Select-Object -First 1
  if ($null -eq $uninstaller) { throw 'Installed uninstaller is missing.' }
  Write-Host 'Uninstalling silently...' -ForegroundColor Cyan
  $uninstall = Start-Process -FilePath $uninstaller.FullName -ArgumentList @(
    '/VERYSILENT',
    '/SUPPRESSMSGBOXES',
    '/NORESTART',
    "/LOG=$uninstallLog"
  ) -Wait -PassThru
  if ($uninstall.ExitCode -ne 0) { throw "Uninstaller failed with exit code $($uninstall.ExitCode)." }
  $installed = $false
  if (Test-Path -LiteralPath $application) { throw 'Application files remained after uninstall.' }
  if (-not (Test-Path -LiteralPath (Join-Path $dataDirectory 'workspace.sqlite') -PathType Leaf)) {
    throw 'Uninstall removed the user workspace database.'
  }
} finally {
  if (Test-Path -LiteralPath $application -PathType Leaf) {
    $stop = Start-Process -FilePath $application -ArgumentList '--stop' -Wait -PassThru
  }
  if ($installed -and (Test-Path -LiteralPath $installDirectory -PathType Container)) {
    $uninstaller = Get-ChildItem -LiteralPath $installDirectory -Filter 'unins*.exe' -File | Select-Object -First 1
    if ($null -ne $uninstaller) {
      $cleanup = Start-Process -FilePath $uninstaller.FullName -ArgumentList @(
        '/VERYSILENT',
        '/SUPPRESSMSGBOXES',
        '/NORESTART'
      ) -Wait -PassThru
    }
  }
}

Write-Host "Windows installer acceptance passed: $acceptanceOutput" -ForegroundColor Green
