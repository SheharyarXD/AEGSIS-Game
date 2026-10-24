$ErrorActionPreference = 'Stop'
$env:PHASE8_LIVE_VERIFICATION = '1'
$env:PHASE8_STAGE = 'after'
$env:AEGIS_BASE_URL = 'http://127.0.0.1:5192'
$env:PHASE8_VIEWPORT = '1280x720'
$phase9Failures = @()
foreach ($phase9Tier in @('MEDIUM','LOW','HIGH','ULTRA')) {
    $env:PHASE8_QUALITY = $phase9Tier
    $env:PHASE8_PERF_OUT = "artifacts/phase9/performance-after-$phase9Tier"
    $env:PHASE8_SCENES = if ($phase9Tier -eq 'MEDIUM') {'cold-flight,street-traversal,rooftop-traversal,aerial-traversal,rain-night,combat'} else {'cold-flight,street-traversal,rain-night'}
    & node scripts/phase8-live-performance.mjs *> "artifacts/phase9/performance-after-$phase9Tier.log"
    if ($LASTEXITCODE -ne 0) { $phase9Failures += $phase9Tier }
    Write-Output "Finished $phase9Tier (shared GPU; emulator retained)."
}
if ($phase9Failures.Count) { throw "Performance failures: $($phase9Failures -join ', ')" }
