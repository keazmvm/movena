[CmdletBinding()]
param(
  [string]$Publisher = 'CN=835348BD-2CCC-485D-9650-265D1D9D4E15'
)

$ErrorActionPreference = 'Stop'

# Check if a certificate for this publisher already exists in CurrentUser\My
$existingCert = Get-ChildItem "Cert:\CurrentUser\My" | Where-Object { $_.Subject -eq $Publisher } | Select-Object -First 1

if (-not $existingCert) {
  Write-Host "Creating self-signed certificate for $Publisher..."
  $cert = New-SelfSignedCertificate `
    -Type Custom `
    -Subject $Publisher `
    -KeyUsage DigitalSignature `
    -FriendlyName "Movena Dev Cert" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
} else {
  $cert = $existingCert
  Write-Host "Using existing certificate ($($cert.Thumbprint)) for $Publisher"
}

$tempCertPath = Join-Path $env:TEMP 'MovenaDevCert.cer'
Export-Certificate -Cert $cert -FilePath $tempCertPath | Out-Null

Write-Host "Adding certificate to Root and TrustedPeople stores..."
& certutil.exe -addstore -f -user Root $tempCertPath | Out-Null
& certutil.exe -addstore -f -user TrustedPeople $tempCertPath | Out-Null
Remove-Item -LiteralPath $tempCertPath -Force -ErrorAction SilentlyContinue

$scriptPath = Join-Path $PSScriptRoot 'make-msix.ps1'
Write-Host "Packaging and signing MSIX with thumbprint $($cert.Thumbprint)..."
& $scriptPath -SkipBuild -Publisher $Publisher -CertificateThumbprint $cert.Thumbprint
