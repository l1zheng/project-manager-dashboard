param(
  [Parameter(Mandatory = $true)]
  [string]$ReleaseDirectory,
  [ValidateSet('x64')]
  [string]$Architecture = 'x64',
  [string]$ApplicationVersion = '0.1.0',
  [string]$OutputDirectory = 'artifacts',
  [string]$InnoCompiler,
  [string]$SignToolCommand
)

$ErrorActionPreference = 'Stop'
$releaseRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = Split-Path -Parent $releaseRoot
$configPath = Join-Path $releaseRoot 'windows-installer.config.json'
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$sourceRelease = [IO.Path]::GetFullPath($ReleaseDirectory)
$artifactRoot = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $OutputDirectory))
$stagingRoot = Join-Path $artifactRoot ('.installer-staging-' + [Guid]::NewGuid().ToString('N'))
$stagedApplication = Join-Path $stagingRoot 'ProjectManagerDashboard'
$installerName = "ProjectManagerDashboard-Setup-$ApplicationVersion-win-$Architecture.exe"
$installerPath = Join-Path $artifactRoot $installerName
$launcherPath = Join-Path $stagedApplication ([string]$config.executableName)
$launcherSource = Join-Path $releaseRoot 'windows\installer\ProjectManagerDashboardLauncher.cs'
$launcherManifest = Join-Path $releaseRoot 'windows\installer\ProjectManagerDashboardLauncher.manifest'
$installerSource = Join-Path $releaseRoot 'windows\installer\ProjectManagerDashboard.iss'

function Find-InnoCompiler {
  $candidates = @(
    $InnoCompiler,
    (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 7\ISCC.exe'),
    (Join-Path $env:ProgramFiles 'Inno Setup 7\ISCC.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 7\ISCC.exe')
  )
  foreach ($candidate in $candidates) {
    if (-not [string]::IsNullOrWhiteSpace($candidate) -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      return [IO.Path]::GetFullPath($candidate)
    }
  }
  throw 'Inno Setup compiler was not found. Run release\install-inno-setup.ps1 or pass -InnoCompiler.'
}

try {
  if ($ApplicationVersion -notmatch '^\d+\.\d+\.\d+([.-][0-9A-Za-z.-]+)?$') {
    throw 'ApplicationVersion must be a semantic version such as 0.1.0.'
  }
  if (-not (Test-Path -LiteralPath $sourceRelease -PathType Container)) {
    throw "Portable release directory was not found: $sourceRelease"
  }
  $releaseInfoPath = Join-Path $sourceRelease 'RELEASE-INFO.json'
  if (-not (Test-Path -LiteralPath $releaseInfoPath -PathType Leaf)) {
    throw 'The source directory is not a packaged portable release.'
  }
  $releaseInfo = Get-Content -LiteralPath $releaseInfoPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($releaseInfo.application.version -ne $ApplicationVersion) {
    throw "Portable release version $($releaseInfo.application.version) does not match installer version $ApplicationVersion."
  }
  if ($releaseInfo.target.platform -ne 'win32' -or $releaseInfo.target.architecture -ne $Architecture) {
    throw "Portable release target must be win32/$Architecture."
  }
  if (Test-Path -LiteralPath $installerPath) { throw "Installer already exists: $installerPath" }

  $compiler = Find-InnoCompiler
  $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
  if (-not (Test-Path -LiteralPath $csc -PathType Leaf)) {
    throw 'The Windows .NET Framework x64 C# compiler was not found.'
  }

  New-Item -ItemType Directory -Path $artifactRoot, $stagedApplication -Force | Out-Null
  Get-ChildItem -LiteralPath $sourceRelease -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $stagedApplication -Recurse -Force
  }
  $assemblyInfoPath = Join-Path $stagingRoot 'AssemblyInfo.cs'
  $assemblyVersion = ($ApplicationVersion -replace '-.*$', '')
  $assemblyInfo = @"
using System.Reflection;
[assembly: AssemblyTitle("$($config.productName)")]
[assembly: AssemblyProduct("$($config.productName)")]
[assembly: AssemblyCompany("$($config.publisher)")]
[assembly: AssemblyCopyright("Copyright © $($config.publisher)")]
[assembly: AssemblyVersion("$assemblyVersion.0")]
[assembly: AssemblyFileVersion("$assemblyVersion.0")]
"@
  [IO.File]::WriteAllText($assemblyInfoPath, $assemblyInfo, (New-Object Text.UTF8Encoding($false)))

  Write-Host 'Compiling native Windows launcher...' -ForegroundColor Cyan
  & $csc `
    /nologo `
    /target:winexe `
    /platform:$Architecture `
    /optimize+ `
    /checked+ `
    /warnaserror+ `
    /reference:System.dll `
    /reference:System.Core.dll `
    /reference:System.Windows.Forms.dll `
    /win32manifest:$launcherManifest `
    /out:$launcherPath `
    $launcherSource `
    $assemblyInfoPath
  if ($LASTEXITCODE -ne 0) { throw "Native launcher compilation failed with exit code $LASTEXITCODE." }

  $previousDialogs = $env:PM_LAUNCHER_NO_DIALOGS
  $previousCi = $env:CI
  try {
    $env:PM_LAUNCHER_NO_DIALOGS = '1'
    $env:CI = 'true'
    $launcherCheck = Start-Process -FilePath $launcherPath -ArgumentList '--check' -Wait -PassThru
    if ($launcherCheck.ExitCode -ne 0) { throw 'The compiled native launcher failed its packaged release check.' }
  } finally {
    $env:PM_LAUNCHER_NO_DIALOGS = $previousDialogs
    $env:CI = $previousCi
  }

  Write-Host 'Compiling per-user Windows installer...' -ForegroundColor Cyan
  $previousSource = $env:PM_INSTALLER_SOURCE_DIR
  $previousOutput = $env:PM_INSTALLER_OUTPUT_DIR
  $previousVersion = $env:PM_INSTALLER_VERSION
  $previousSigning = $env:PM_INSTALLER_SIGNING_ENABLED
  try {
    $env:PM_INSTALLER_SOURCE_DIR = $stagedApplication
    $env:PM_INSTALLER_OUTPUT_DIR = $artifactRoot
    $env:PM_INSTALLER_VERSION = $ApplicationVersion
    $compilerArguments = @()
    if (-not [string]::IsNullOrWhiteSpace($SignToolCommand)) {
      if ($SignToolCommand -notmatch '\$f') {
        throw 'SignToolCommand must contain the Inno Setup $f file placeholder.'
      }
      $env:PM_INSTALLER_SIGNING_ENABLED = '1'
      $compilerArguments += "/Sinstaller=$SignToolCommand"
    } else {
      $env:PM_INSTALLER_SIGNING_ENABLED = '0'
    }
    $compilerArguments += $installerSource
    & $compiler $compilerArguments
    if ($LASTEXITCODE -ne 0) { throw "Inno Setup compilation failed with exit code $LASTEXITCODE." }
  } finally {
    $env:PM_INSTALLER_SOURCE_DIR = $previousSource
    $env:PM_INSTALLER_OUTPUT_DIR = $previousOutput
    $env:PM_INSTALLER_VERSION = $previousVersion
    $env:PM_INSTALLER_SIGNING_ENABLED = $previousSigning
  }

  if (-not (Test-Path -LiteralPath $installerPath -PathType Leaf)) {
    throw "Inno Setup did not produce the expected installer: $installerPath"
  }
  if (-not [string]::IsNullOrWhiteSpace($SignToolCommand)) {
    foreach ($signedFile in @($launcherPath, $installerPath)) {
      $signature = Get-AuthenticodeSignature -LiteralPath $signedFile
      if ($signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
        throw "Authenticode signing did not produce a valid signature: $signedFile ($($signature.Status))"
      }
    }
  }
  Write-Host "Windows installer created: $installerPath" -ForegroundColor Green
  Write-Output $installerPath
} finally {
  if (Test-Path -LiteralPath $stagingRoot) {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force
  }
}
