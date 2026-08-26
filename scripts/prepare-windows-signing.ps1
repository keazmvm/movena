param(
  [Parameter(Mandatory = $true)][string]$CertificateBase64,
  [Parameter(Mandatory = $true)][string]$CertificatePassword
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($CertificateBase64) -or [string]::IsNullOrWhiteSpace($CertificatePassword)) {
  throw 'Both WINDOWS_CERTIFICATE and WINDOWS_CERTIFICATE_PASSWORD are required for Authenticode signing.'
}

$pfxPath = Join-Path $env:RUNNER_TEMP 'movena-signing.pfx'
$configPath = Join-Path $env:RUNNER_TEMP 'tauri-windows-signing.json'
try {
  [IO.File]::WriteAllBytes($pfxPath, [Convert]::FromBase64String($CertificateBase64))
  $securePassword = ConvertTo-SecureString $CertificatePassword -AsPlainText -Force
  $certificate = Import-PfxCertificate -FilePath $pfxPath -CertStoreLocation 'Cert:\CurrentUser\My' -Password $securePassword
  if (-not $certificate.HasPrivateKey) { throw 'The imported code-signing certificate has no private key.' }

  $config = @{
    bundle = @{
      windows = @{
        digestAlgorithm = 'sha256'
        certificateThumbprint = $certificate.Thumbprint
        timestampUrl = 'https://timestamp.digicert.com'
        tsp = $true
      }
    }
  }
  $config | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $configPath -Encoding utf8
  "WINDOWS_SIGNING_CONFIG=$configPath" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
  "WINDOWS_CERTIFICATE_THUMBPRINT=$($certificate.Thumbprint)" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
} finally {
  Remove-Item -LiteralPath $pfxPath -Force -ErrorAction SilentlyContinue
}
