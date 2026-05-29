#requires -Version 5.1
# Authenticode-signs a single file passed as $args[0]. Tauri invokes this
# as its bundle.windows.signCommand BEFORE generating the updater .sig, so
# the .sig matches the signed binary.
#
# Driven entirely by environment variables so it is a no-op on dev machines
# and unsigned CI runs:
#   WINDOWS_CERT_PFX_BASE64 — base64 of the Authenticode .pfx (required)
#   WINDOWS_CERT_PASSWORD   — the .pfx password (optional)
#
# When WINDOWS_CERT_PFX_BASE64 is absent the file is left unsigned and the
# build proceeds — local `tauri build` never fails for lack of a cert.

param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string] $FilePath
)

$ErrorActionPreference = 'Stop'

if (-not $env:WINDOWS_CERT_PFX_BASE64) {
  Write-Host "authenticode-sign: no WINDOWS_CERT_PFX_BASE64 — leaving '$FilePath' unsigned"
  exit 0
}

if (-not (Test-Path $FilePath)) {
  throw "authenticode-sign: file not found: $FilePath"
}

$tempPfx = Join-Path ([IO.Path]::GetTempPath()) ("tortuga-codesign-{0}.pfx" -f ([Guid]::NewGuid()))
try {
  [IO.File]::WriteAllBytes($tempPfx, [Convert]::FromBase64String($env:WINDOWS_CERT_PFX_BASE64))

  $signtool = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -like '*x64*' } |
    Select-Object -First 1 -ExpandProperty FullName
  if (-not $signtool) { throw "authenticode-sign: signtool.exe not found" }

  $signArgs = @('sign', '/f', $tempPfx)
  if ($env:WINDOWS_CERT_PASSWORD) { $signArgs += @('/p', $env:WINDOWS_CERT_PASSWORD) }
  $signArgs += @('/fd', 'SHA256', '/tr', 'http://timestamp.digicert.com', '/td', 'SHA256', $FilePath)

  & $signtool @signArgs
  if ($LASTEXITCODE -ne 0) { throw "authenticode-sign: signtool failed on $FilePath (exit $LASTEXITCODE)" }
  Write-Host "authenticode-sign: signed $FilePath"
}
finally {
  if (Test-Path $tempPfx) { Remove-Item $tempPfx -Force }
}
