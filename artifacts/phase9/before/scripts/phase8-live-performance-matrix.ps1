$ErrorActionPreference='Stop'
if($env:PHASE8_LIVE_VERIFICATION -ne '1'){throw 'Explicit live-verification authorization is required.'}
$matrixRoot='artifacts/phase8/live-2026-10-18'
$env:PHASE8_VIEWPORT='1280x720'
$env:AEGIS_BASE_URL='http://127.0.0.1:5192'
$env:PHASE8_STAGE='final'
foreach($phase8Tier in @('LOW','MEDIUM','HIGH','ULTRA')){
 $env:PHASE8_QUALITY=$phase8Tier
 $env:PHASE8_SCENES=if($phase8Tier -eq 'LOW'){'cold-flight,warm-flight,street-traversal,rooftop-traversal,aerial-traversal,rain-night,combat,first-hit,rain-collapse'}else{'cold-flight,street-traversal,rain-night,rain-collapse'}
 $env:PHASE8_PERF_OUT="$matrixRoot/performance-final-$phase8Tier-1280x720"
 & node scripts/phase8-live-performance.mjs
 if($LASTEXITCODE -ne 0){throw "Final $phase8Tier measurement failed; inspect raw results."}
}
$env:AEGIS_BASE_URL='http://127.0.0.1:5206'
$env:PHASE8_STAGE='before'
$env:PHASE8_QUALITY='LOW'
$env:PHASE8_SCENES='cold-flight,street-traversal,rain-night,first-hit,rain-collapse'
$env:PHASE8_PERF_OUT="$matrixRoot/performance-before-LOW-1280x720"
& node scripts/phase8-live-performance.mjs
if($LASTEXITCODE -ne 0){throw 'Matched baseline measurement failed.'}
$env:AEGIS_BASE_URL='http://127.0.0.1:5192'
$env:PHASE8_STAGE='final'
$env:PHASE8_VIEWPORT='1920x1080'
$env:PHASE8_SCENES='street-traversal,rain-night'
$env:PHASE8_PERF_OUT="$matrixRoot/performance-final-LOW-1920x1080"
& node scripts/phase8-live-performance.mjs
if($LASTEXITCODE -ne 0){throw 'Native 1080p LOW measurement failed.'}
