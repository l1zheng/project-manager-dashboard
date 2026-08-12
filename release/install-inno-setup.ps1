param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDirectory,
  [string]$DownloadDirectory
)

$ErrorActionPreference = 'Stop'
$releaseRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$config = Get-Content -LiteralPath (Join-Path $releaseRoot 'windows-installer.config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$installRoot = [IO.Path]::GetFullPath($InstallDirectory)
if ([string]::IsNullOrWhiteSpace($DownloadDirectory)) {
  $DownloadDirectory = Join-Path (Split-Path -Parent $installRoot) 'downloads'
}
$downloadRoot = [IO.Path]::GetFullPath($DownloadDirectory)
$installerPath = Join-Path $downloadRoot ("innosetup-$($config.innoSetup.version)-x64.exe")
$compilerPath = Join-Path $installRoot 'ISCC.exe'

function Assert-AuthenticodeSigner([string]$Path) {
  $signature = Get-AuthenticodeSignature -LiteralPath $Path
  if ($signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
    throw "Inno Setup installer has an invalid Authenticode signature: $($signature.Status)"
  }
  if ($null -eq $signature.SignerCertificate -or $signature.SignerCertificate.Subject -notlike "*$($config.innoSetup.expectedSigner)*") {
    throw "Unexpected Inno Setup signer: $($signature.SignerCertificate.Subject)"
  }
}

if (Test-Path -LiteralPath $compilerPath -PathType Leaf) {
  Write-Output $compilerPath
  exit 0
}

New-Item -ItemType Directory -Path $downloadRoot, $installRoot -Force | Out-Null
if (-not (Test-Path -LiteralPath $installerPath -PathType Leaf)) {
  Write-Host "Downloading Inno Setup $($config.innoSetup.version) from its official release..." -ForegroundColor Cyan
  Invoke-WebRequest -UseBasicParsing -Uri ([string]$config.innoSetup.url) -OutFile $installerPath
}
Assert-AuthenticodeSigner $installerPath

Write-Host 'Installing the verified Inno Setup compiler into the build tools directory...' -ForegroundColor Cyan
$install = Start-Process -FilePath $installerPath -ArgumentList @(
  '/VERYSILENT',
  '/SUPPRESSMSGBOXES',
  '/NORESTART',
  '/SP-',
  '/CURRENTUSER',
  "/DIR=$installRoot"
) -Wait -PassThru
if ($install.ExitCode -ne 0) { throw "Inno Setup installation failed with exit code $($install.ExitCode)." }
if (-not (Test-Path -LiteralPath $compilerPath -PathType Leaf)) {
  throw "Inno Setup compiler was not installed at the expected path: $compilerPath"
}
Write-Output $compilerPath
