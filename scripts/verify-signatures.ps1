param([Parameter(Mandatory = $true)][string]$Directory)
$ErrorActionPreference = 'Stop'
$publisher = $env:ELECTRICCAD_PUBLISHER_NAME
if ([string]::IsNullOrWhiteSpace($publisher)) { throw 'ELECTRICCAD_PUBLISHER_NAME is required.' }
$package = Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\package.json') -Raw | ConvertFrom-Json
$releaseRoot = (Resolve-Path -LiteralPath $Directory).Path
$setupName = "ElectricCAD-Easy-$($package.version)-Setup-x64.exe"
$binaries = @((Join-Path $releaseRoot $setupName), (Join-Path $releaseRoot 'win-unpacked\ElectricCAD Easy.exe'))
foreach ($file in $binaries) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing release binary: $file" }
  $signature = Get-AuthenticodeSignature -LiteralPath $file
  if ($signature.Status -ne 'Valid') { throw "Invalid Authenticode signature: $file ($($signature.Status))" }
  if ($signature.SignerCertificate.Subject -eq $signature.SignerCertificate.Issuer) { throw "Self-signed publisher certificate is not accepted: $file" }
  $actualPublisher = $signature.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
  if ($actualPublisher -cne $publisher.Trim()) { throw "Unexpected certificate publisher: $file" }
  if ($null -eq $signature.TimeStamperCertificate) { throw "Missing timestamp: $file" }
  Write-Output "SIGNATURE_VALID $([IO.Path]::GetFileName($file))"
}
$assets = @($setupName, "$setupName.blockmap", 'latest.yml')
$checksums = foreach ($name in $assets) {
  $file = Join-Path $releaseRoot $name
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing update asset: $name" }
  $hash = Get-FileHash -LiteralPath $file -Algorithm SHA256
  "$($hash.Hash.ToLowerInvariant())  $name"
}
[IO.File]::WriteAllLines((Join-Path $releaseRoot 'SHA256SUMS.txt'), $checksums, [Text.UTF8Encoding]::new($false))
Write-Output 'SIGNED_RELEASE_VERIFIED'
