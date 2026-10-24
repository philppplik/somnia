# Builds an UNSIGNED .msix from the Windows release build (CI, windows-latest). The Store signs the package after upload.
# Env: MSIX_IDENTITY_NAME, MSIX_PUBLISHER, MSIX_PUBLISHER_DISPLAY_NAME (from Partner Center; defaults are the Somnia Editor Partner Center values (PFN PhilippPaulik.SomniaEditor_5r0205h9k3wrt).
$ErrorActionPreference = 'Stop'
$pkg = Get-Content package.json -Raw | ConvertFrom-Json
$v = [string]$pkg.somniaRelease
# Store identity version from scripts/msix-version.mjs: x.y.z.0 (fourth section is
# Store-reserved and must stay 0; prerelease suffixes are stripped). MSIX_VERSION env
# overrides the mapping when a stable release would collide with a beta already in the Store.
$version = (node scripts/msix-version.mjs).Trim()
if ($version -notmatch '^\d+\.\d+\.\d+\.\d+$') { throw "msix-version.mjs returned '$version'." }
$identity = if ($env:MSIX_IDENTITY_NAME) { $env:MSIX_IDENTITY_NAME } else { 'PhilippPaulik.SomniaEditor' }
$publisher = if ($env:MSIX_PUBLISHER) { $env:MSIX_PUBLISHER } else { 'CN=F8533395-4C90-4374-9DA3-5FB3D3AE436E' }
$pubName = if ($env:MSIX_PUBLISHER_DISPLAY_NAME) { $env:MSIX_PUBLISHER_DISPLAY_NAME } else { 'Philipp Paulik' }
$exe = 'src-tauri/target/release/somnia.exe'
if (-not (Test-Path $exe)) { throw "Missing $exe. Build the app first." }
$layout = 'msix-layout'; Remove-Item $layout -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory "$layout/Assets" | Out-Null
Copy-Item $exe "$layout/somnia.exe"
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile((Resolve-Path 'src-tauri/icons/icon.png'))
foreach ($t in @(@('StoreLogo',50),@('Square44x44Logo',44),@('Square150x150Logo',150))) {
  $bmp = New-Object System.Drawing.Bitmap $t[1], $t[1]
  $g = [System.Drawing.Graphics]::FromImage($bmp); $g.InterpolationMode = 'HighQualityBicubic'; $g.DrawImage($src, 0, 0, $t[1], $t[1]); $g.Dispose()
  $bmp.Save("$layout/Assets/$($t[0]).png", [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
}
$src.Dispose()
(Get-Content msix/AppxManifest.template.xml -Raw).Replace('{{IDENTITY_NAME}}',$identity).Replace('{{PUBLISHER}}',$publisher).Replace('{{PUBLISHER_DISPLAY_NAME}}',$pubName).Replace('{{VERSION}}',$version) | Set-Content "$layout/AppxManifest.xml" -Encoding UTF8
$makeappx = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -Recurse -Filter makeappx.exe | Where-Object { $_.FullName -match '\\x64\\' } | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $makeappx) { throw 'makeappx.exe not found (Windows SDK missing on this runner).' }
New-Item -ItemType Directory out -Force | Out-Null
$outFile = "out/Somnia-$v-x64.msix"
& $makeappx.FullName pack /d $layout /p $outFile /o
if ($LASTEXITCODE -ne 0) { throw "makeappx failed with $LASTEXITCODE" }
Get-Item $outFile | Select-Object Name, Length
