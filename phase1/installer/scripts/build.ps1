# Manual packaging only. Run on Windows after the app's standard local build checks.
# Supply the measured installed size from an isolated Windows test machine.
param(
    [Parameter(Mandatory=$true)][ValidateRange(1, [long]::MaxValue)][long]$InstalledBytes,
    [string]$Payload
)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '../..')
Push-Location $root
try {
    if (-not $Payload) {
        npm run tauri build -- --ci --config src-tauri/tauri.windows-alpha.conf.json --config src-tauri/tauri.custom-installer-payload.conf.json --bundles nsis
        if ($LASTEXITCODE) { throw 'Tauri payload build failed' }
        $files = @(Get-ChildItem 'src-tauri/target/release/bundle/nsis/*.exe')
        if ($files.Count -ne 1) { throw 'Expected exactly one payload. Pass -Payload explicitly when multiple builds exist.' }
        $Payload = $files[0].FullName
    }
    $env:SOMNIA_NSIS_PAYLOAD = (Resolve-Path $Payload).Path
    $env:SOMNIA_INSTALLED_BYTES = [string]$InstalledBytes
    $env:SOMNIA_VERSION = (Get-Content 'src-tauri/tauri.conf.json' -Raw | ConvertFrom-Json).version
    if ($env:SOMNIA_VERSION -eq '0.1.0') { throw 'Run scripts/sync-version.mjs before packaging.' }
    Push-Location 'installer'
    try {
        cargo build --release --locked -p somnia-setup
        if ($LASTEXITCODE) { throw 'Custom installer build failed' }
        New-Item -ItemType Directory '../out-installer' -Force | Out-Null
        Copy-Item 'target/release/Somnia-Setup.exe' '../out-installer/Somnia-Setup.exe'
        $hash = (Get-FileHash '../out-installer/Somnia-Setup.exe' -Algorithm SHA256).Hash.ToLower()
        "$hash  Somnia-Setup.exe" | Set-Content '../out-installer/SHA256SUMS' -Encoding ascii
    } finally { Pop-Location }
} finally { Pop-Location }
