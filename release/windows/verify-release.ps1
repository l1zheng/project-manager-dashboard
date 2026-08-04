param(
  [Parameter(Mandatory = $true)]
  [string]$ReleaseRoot,
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

try {
  $root = [IO.Path]::GetFullPath($ReleaseRoot).TrimEnd('\')
  $rootPrefix = $root + '\'
  $manifestPath = Join-Path $root 'RELEASE-MANIFEST.json'
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw 'RELEASE-MANIFEST.json is missing.'
  }

  $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($manifest.format -ne 'project-manager-dashboard-release' -or $manifest.version -ne 1) {
    throw 'The release manifest format is not supported.'
  }

  $entries = @($manifest.files)
  $actualFiles = New-Object Collections.Generic.List[IO.FileInfo]
  $pendingDirectories = New-Object Collections.Generic.Stack[IO.DirectoryInfo]
  $pendingDirectories.Push((Get-Item -LiteralPath $root))
  while ($pendingDirectories.Count -gt 0) {
    $directory = $pendingDirectories.Pop()
    foreach ($item in (Get-ChildItem -LiteralPath $directory.FullName -Force)) {
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Release contains a symbolic link or junction: $($item.FullName)"
      }
      if ($item.PSIsContainer) {
        $pendingDirectories.Push($item)
      } elseif ($item.FullName -ne $manifestPath) {
        $actualFiles.Add($item)
      }
    }
  }
  if ($entries.Count -ne $actualFiles.Count) {
    throw "Release contains $($actualFiles.Count) files, while the manifest lists $($entries.Count)."
  }

  $expected = @{}
  foreach ($entry in $entries) {
    $path = [string]$entry.path
    if ([string]::IsNullOrWhiteSpace($path) -or $path.StartsWith('/') -or $path.Contains('\') -or $path.Split('/') -contains '..') {
      throw "Unsafe manifest path: $path"
    }
    if ($expected.ContainsKey($path)) { throw "Duplicate manifest path: $path" }
    $expected[$path] = $entry
  }

  foreach ($file in $actualFiles) {
    $fullPath = [IO.Path]::GetFullPath($file.FullName)
    if (-not $fullPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Release file escapes its root: $fullPath"
    }
    $relativePath = $fullPath.Substring($rootPrefix.Length).Replace('\', '/')
    if (-not $expected.ContainsKey($relativePath)) { throw "Unexpected release file: $relativePath" }
    $entry = $expected[$relativePath]
    if ([Int64]$entry.bytes -ne $file.Length) { throw "Release file size differs: $relativePath" }
    $digest = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($digest -ne ([string]$entry.sha256).ToLowerInvariant()) {
      throw "Release file hash differs: $relativePath"
    }
  }

  if (-not $Quiet) { Write-Host 'Release integrity verification succeeded.' -ForegroundColor Green }
  exit 0
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
