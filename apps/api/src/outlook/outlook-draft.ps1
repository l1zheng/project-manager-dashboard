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
