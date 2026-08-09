param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Probe', 'CreateDraft')]
  [string]$Mode,
  [string]$InputPath
)

$ErrorActionPreference = 'Stop'

try {
  if ($Mode -eq 'Probe') {
    if ([type]::GetTypeFromProgID('Outlook.Application', $false) -eq $null) {
      exit 10
    }
    [pscustomobject]@{ available = $true } | ConvertTo-Json -Compress
    exit 0
  }

  if ([string]::IsNullOrWhiteSpace($InputPath) -or -not (Test-Path -LiteralPath $InputPath -PathType Leaf)) {
    exit 11
  }
  $payload = Get-Content -LiteralPath $InputPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ([string]::IsNullOrWhiteSpace([string]$payload.subject) -or [string]::IsNullOrWhiteSpace([string]$payload.htmlFragment)) {
    exit 11
  }

  $outlook = New-Object -ComObject Outlook.Application
  $mail = $outlook.CreateItem(0)
  $mail.BodyFormat = 2
  $mail.Subject = [string]$payload.subject
  $mail.Display($false)

  $requestRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $InputPath))
  $requestPrefix = $requestRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  foreach ($image in @($payload.inlineImages)) {
    $contentId = [string]$image.contentId
    $mimeType = [string]$image.mimeType
    $imagePath = [System.IO.Path]::GetFullPath([string]$image.path)
    if (-not $imagePath.StartsWith($requestPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      exit 11
    }
    if (-not (Test-Path -LiteralPath $imagePath -PathType Leaf)) {
      exit 11
    }
    if ($contentId -notmatch '^pm-[a-zA-Z0-9-]{1,100}@local$') {
      exit 11
    }
    if ($mimeType -notin @('image/png', 'image/jpeg', 'image/gif')) {
      exit 11
    }
    $attachment = $mail.Attachments.Add($imagePath, 1, 0)
    $attachment.PropertyAccessor.SetProperty('http://schemas.microsoft.com/mapi/proptag/0x3712001F', $contentId)
    $attachment.PropertyAccessor.SetProperty('http://schemas.microsoft.com/mapi/proptag/0x370E001F', $mimeType)
    $attachment.PropertyAccessor.SetProperty('http://schemas.microsoft.com/mapi/proptag/0x7FFE000B', $true)
  }

  $existingBody = [string]$mail.HTMLBody
  $bodyTag = [regex]::Match($existingBody, '<body\b[^>]*>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($bodyTag.Success) {
    $insertAt = $bodyTag.Index + $bodyTag.Length
    $mail.HTMLBody = $existingBody.Insert($insertAt, [string]$payload.htmlFragment)
  } else {
    $mail.HTMLBody = ([string]$payload.htmlFragment) + $existingBody
  }

  [pscustomobject]@{ status = 'displayed' } | ConvertTo-Json -Compress
  exit 0
} catch {
  [Console]::Error.WriteLine('outlook_automation_failed')
  exit 12
}
