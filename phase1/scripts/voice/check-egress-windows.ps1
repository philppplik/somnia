$ErrorActionPreference = 'Stop'
$root = (Resolve-Path 'phase1/dist-voice').Path
$evidence = Join-Path $root 'evidence'
New-Item -ItemType Directory -Force $evidence | Out-Null
$helper = Join-Path $root 'helper/whisper-cli.exe'
$node = (Get-Command node).Source
$prefix = 'SomniaVoiceCI-' + [Guid]::NewGuid().ToString()
$backup = Join-Path $evidence 'audit-backup.csv'
# WFP connection and packet-drop auditing. Save and restore policy even on failure.
& auditpol /backup /file:$backup | Out-File (Join-Path $evidence 'audit-setup.log')
if ($LASTEXITCODE -ne 0) { throw 'Could not save audit policy' }
try {
  & auditpol /set '/subcategory:{0CCE9226-69AE-11D9-BED3-505054503030}' /success:enable /failure:enable | Out-File (Join-Path $evidence 'audit-setup.log') -Append
  if ($LASTEXITCODE -ne 0) { throw 'WFP connection audit unavailable' }
  & auditpol /set '/subcategory:{0CCE9225-69AE-11D9-BED3-505054503030}' /failure:enable | Out-File (Join-Path $evidence 'audit-setup.log') -Append
  if ($LASTEXITCODE -ne 0) { throw 'WFP drop audit unavailable' }
  foreach ($program in @($helper,$node)) {
    New-NetFirewallRule -DisplayName ($prefix + '-' + [Guid]::NewGuid().ToString()) -Direction Outbound -Program $program -Action Block -Profile Any | Out-Null
  }
  $start = Get-Date
  & $node phase1/scripts/voice/network-negative.mjs
  Start-Sleep -Seconds 3
  $events = @(Get-WinEvent -FilterHashtable @{LogName='Security'; Id=5152,5156,5157; StartTime=$start} -ErrorAction SilentlyContinue)
  $negative = @($events | Where-Object { $_.ToXml().ToLower().Contains('node.exe') })
  $negative | ForEach-Object { $_.ToXml() } | Out-File (Join-Path $evidence 'negative-wfp.xml')
  if ($negative.Count -eq 0) { throw 'Hostile negative control was not visible in WFP audit; cannot claim observation' }
  foreach ($language in @('de','en')) {
    $start = Get-Date
    & $helper -m (Join-Path $root 'ggml-base.bin') -f (Join-Path $root 'synthetic.wav') -l $language -ng -np -nt -otxt -of (Join-Path $evidence ('transcript-'+$language)) *> (Join-Path $evidence ('helper-'+$language+'.log'))
    if ($LASTEXITCODE -ne 0) { throw 'Local helper fixture failed' }
    Start-Sleep -Seconds 3
    $events = @(Get-WinEvent -FilterHashtable @{LogName='Security'; Id=5152,5156,5157; StartTime=$start} -ErrorAction SilentlyContinue)
    $found = @($events | Where-Object { $_.ToXml().ToLower().Contains('whisper-cli.exe') })
    $found | ForEach-Object { $_.ToXml() } | Out-File (Join-Path $evidence ('helper-'+$language+'-wfp.xml'))
    if ($found.Count -gt 0) { throw 'Helper attempted networking during inference' }
  }
  @{testBoundary='Program-scoped CI firewall + WFP audit';negativeControlDetected=$true;syntheticDEEN=$true;productionIsolationProven=$false;releaseReady=$false} | ConvertTo-Json | Out-File (Join-Path $evidence 'egress-result.json')
} finally {
  Get-NetFirewallRule -DisplayName ($prefix+'*') -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  & auditpol /restore /file:$backup | Out-File (Join-Path $evidence 'audit-restore.log')
  if ($LASTEXITCODE -ne 0) { Write-Error 'Audit policy restore failed' }
}
