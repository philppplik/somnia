# Somnia CLI installer for Windows (x64). Non-interactive, idempotent, no prompts.
# Uses only GitHub Release assets of philppplik/somnia and verifies SHA256SUMS before installing.
#   powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 [-Version vX.Y.Z[-pre]] [-Prefix DIR] [-NoPath]
# $env:SOMNIA_INSTALL_BASE overrides the download base URL and exists for tests only.
param(
  [string]$Version = $env:SOMNIA_VERSION,
  [string]$Prefix = $(if ($env:SOMNIA_PREFIX) { $env:SOMNIA_PREFIX } else { Join-Path $env:LOCALAPPDATA 'Programs\somnia-cli' }),
  [switch]$NoPath
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repo = 'philppplik/somnia'
function Fail($m) { [Console]::Error.WriteLine("somnia-install: $m"); exit 1 }

if (-not [Environment]::Is64BitOperatingSystem) { Fail 'unsupported system (x64 only)' }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$test = $env:SOMNIA_INSTALL_BASE
if (-not $Version -and -not $test) {
  $rels = Invoke-RestMethod -UseBasicParsing "https://api.github.com/repos/$repo/releases?per_page=30"
  foreach ($r in $rels) {
    if ($r.assets | Where-Object { $_.name -match '^somnia-cli-.*-windows-x86_64\.zip$' }) { $Version = $r.tag_name; break }
  }
  if (-not $Version) { Fail 'no release with a Windows CLI archive found' }
}
$base = if ($test) { $test } else { "https://github.com/$repo/releases/download/$Version" }

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("somnia-install-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  $sums = Join-Path $tmp 'SHA256SUMS'
  Invoke-WebRequest -UseBasicParsing "$base/SHA256SUMS" -OutFile $sums
  $lines = Get-Content $sums
  if ($test) {
    $archive = ($lines | ForEach-Object { if ($_ -match '(somnia-cli-\S+-windows-x86_64\.zip)') { $Matches[1] } } | Select-Object -First 1)
    if (-not $archive) { Fail 'no Windows archive listed in SHA256SUMS' }
  } else {
    $archive = "somnia-cli-$($Version.TrimStart('v'))-windows-x86_64.zip"
  }
  $zip = Join-Path $tmp $archive
  Invoke-WebRequest -UseBasicParsing "$base/$archive" -OutFile $zip

  $want = $null
  foreach ($l in $lines) { if ($l -match ('^([0-9a-fA-F]{64})\s+\*?' + [regex]::Escape($archive) + '$')) { $want = $Matches[1].ToLower(); break } }
  if (-not $want) { Fail "$archive is not listed in SHA256SUMS" }
  $got = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLower()
  if ($want -ne $got) { Fail "checksum mismatch for $archive (expected $want, got $got); nothing was installed" }

  Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force
  $src = Join-Path $tmp ([IO.Path]::GetFileNameWithoutExtension($archive))
  if (-not ((Test-Path (Join-Path $src 'somnia.exe')) -and (Test-Path (Join-Path $src 'sidecar\engine.mjs')))) { Fail 'archive layout is not as expected' }

  # Replace the install directory: stage next to it, then swap.
  $parent = Split-Path -Parent $Prefix
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  $new = "$Prefix.new"; $old = "$Prefix.old"
  if (Test-Path $new) { Remove-Item -Recurse -Force $new }
  if (Test-Path $old) { Remove-Item -Recurse -Force $old }
  Move-Item $src $new
  if (Test-Path $Prefix) { Move-Item $Prefix $old }
  Move-Item $new $Prefix
  if (Test-Path $old) { Remove-Item -Recurse -Force $old -ErrorAction SilentlyContinue }

  if (-not $NoPath) {
    $cur = [Environment]::GetEnvironmentVariable('Path', 'User')
    $parts = @(); if ($cur) { $parts = $cur -split ';' | Where-Object { $_ } }
    if (-not ($parts | Where-Object { $_.TrimEnd('\') -ieq $Prefix.TrimEnd('\') })) {
      [Environment]::SetEnvironmentVariable('Path', (($parts + $Prefix) -join ';'), 'User')
    }
  }
  Write-Output "Somnia CLI installed: $(Join-Path $Prefix 'somnia.exe')"
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { [Console]::Error.WriteLine('note: git was not found on PATH (required)') }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { [Console]::Error.WriteLine('note: node 20 or newer was not found on PATH (required for the agent engine)') }
  Write-Output 'Open a new terminal so the updated PATH applies.'
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
