# Phase 9 live verification - 19 October 2026

## Live verification completed - 19 October 2026

The latest user authorization supersedes the earlier live-testing deferral. **62 offline tests, all 46 browser regressions, all six fresh acceptance captures, the 15-scene four-tier matrix, and production browser smoke on LOW/MEDIUM/HIGH/ULTRA pass.** The production MEDIUM check also fires actual stationary Y and verifies eight rounds with an enabled capsule.

The final source before this resumed pass is retained in `artifacts/phase9/live-2026-10-19/before/` (241 files). No application runtime source or supplied asset was changed during this resumed verification. Work here restored missing locked dependencies, strengthened capture placement and overlap telemetry, completed production checks, and replaced the stale deferred report.

A real visual-review issue was caught despite a physics-only assertion passing: the original rooftop fixture hit a sloped facade edge, slid down, and produced an occluded view. That rejected recording and its explanation remain under `live-2026-10-19/acceptance/roof-occluded-view/`. The accepted replacement starts on the actual 48 m roof, excludes the actor from its placement ray, and checks grounded roof height before Y. Character, camera, HUD and collision runtime code remain untouched.

Current measurements use hardware Chrome / GTX 750 Ti, 1280 x 720 CSS viewport. Actual internal dimensions are logged. Pixel ratios are caps: this DPR-1 display uses native 1280 x 720 for MEDIUM/HIGH/ULTRA and 1088 x 612 for LOW. No Android emulator appears in the new hardware allocation snapshots; unrelated applications were left untouched.

| Tier | Internal pixels | Street mean FPS | Rain/night mean FPS | Cold-flight worst ms |
|---|---|---|---|---|
| LOW | 1088 x 612 | 144.1 | 141.2 | 62.5 |
| MEDIUM | 1280 x 720 | 102.8 | 82.7 | 104.2 |
| HIGH | 1280 x 720 | 80.4 | 67.6 | 55.6 |
| ULTRA | 1280 x 720 | 77.1 | 66.5 | 111.2 |

MEDIUM rain/night weapon timing, using actual inputs and no recording during measurement:

| Scene | Mean FPS | p95 ms | p99 ms | Worst ms |
|---|---|---|---|---|
| barrage | 78.3 | 14.0 | 27.8 | 34.8 |
| demolition | 75.8 | 20.9 | 34.8 | 62.6 |
| overlap | 83.2 | 14.0 | 27.8 | 62.6 |

The overlap run contains 21 sampled observations of Y operating while source masses are actively collapsing, including 13 observations after registered breach impacts. Observed shoulder missiles stay within the eight-projectile pool. A separate recording verifies the same sequence. Both attacks preserve the actor's stationary position; no support injection or traversal teleport is used.

MEDIUM cold-flight had a 104.2 ms outlier and ULTRA 111.2 ms. The strict overall sub-100-ms/zero-stutter objective is **not** established. The city also retains the art limitations listed below; do not claim premium visual completion.

Raw current evidence is under `artifacts/phase9/live-2026-10-19/`: `browser-final.json`, `code-checks.json`, `production-smoke.json`, `matrix-status.json`, six `acceptance/*/result.json` files with recordings, `weapons/results.json`, and `overlap-video/results.json`. The refreshed main review links these plus the editable Blender source, GLBs, license/UV/normal audits, before/after photographs and preserved failure histories. Historical 18 October report/data remain in `review-2026-10-18.html` and `verification-2026-10-18.json`.


[Complete review](../artifacts/phase9/review.html) | [Technical handoff](PHASE9-CODEX-TO-CLAUDE-HANDOFF.md)
