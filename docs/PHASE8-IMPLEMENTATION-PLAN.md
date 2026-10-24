# Phase 8 implementation plan and measured freeze diagnosis

Verified baseline: artifacts/phase8/before/snapshot.json (184 files). Current main retains 971 fixed placements, 25 source families, five districts and 2,048 m bounds. Original licensed GLBs and character/HUD source remain preserved. Phase 7 handoff and the newer world-realism handoff/results were reviewed.

## Instrumented diagnosis

GTX 750 Ti, LOW, 1280x720 viewport, actual W+Shift flight. Baseline cold flight: 1,111.2 ms worst frame; first-hit: 3,541.7 ms; rainy first collapse: 3,534.9 ms. Warm flight worst: 7.1 ms. Average FPS conceals these first-use stalls.

Chrome CPU traces identify getProgramInfoLog/onFirstUse as the dominant blocked stack: 6,636 profiler samples during first-hit shader initialization. Runtime GLB attribute conversion/merging, synchronous tile rebuilding and detailed collision remain additional bounded-work concerns. Do not attribute the multi-second freeze primarily to physics without evidence.

## Staged implementation

1. Fix shader cache duplication and prepare exact instanced/plain/instance-color variants before publishing streamed assets; schedule texture uploads. Bound loading to two priority jobs, move Meshopt decode and vertex preparation to workers, reuse cached geometry/materials, and budget tile refresh. Record p50/p95/p99/worst/long tasks again before adding detail.
2. Define district street standards; add composed entrances, cut corners, drain/threshold/loading treatments, authored lamp/fence/storefront modules and historic courtyard connections. Preserve street footprints and the source buildings.
3. Add surface-aligned material-aware thermal intensity/cooling to pooled marks, smoke and sparks. Persist compact scars with building state.
4. Centralize standard3x/heavy5x BUILDING damage, structural/radius/impulse/VFX controls. Keep enemy/player missile values untouched. Add layered short-lived detonation/fireball emitters. Heavy mode is deliberate, remappable, energy/cooldown gated.
5. Add intentional remappable Titan Breakthrough: validate armored flight/speed/energy/exit, preload damage geometry, prepare a collider-clear passage using original facade sections, then move normally through it with the real capsule. Add bounded authored interior damage dressing, entry/exit feedback and persistent openings. No teleport or actor collision disable.
6. Add support connectivity/integrity reporting, staged directional partial/major collapse, material fragment library, and compact persistent rubble. Keep strict active-body and work budgets.
7. Roll reusable proven street/damage tools through the saved city; retain unique landmarks and originals.
8. Capture all requested scenarios in the MAIN game, record matched cold/warm/destruction traces and native settings, run regression/build checks, and document measured failures/limits in a Claude handoff. No commit, upload, deployment or publication.

Telemetry: frame distribution and long tasks, CPU stage scopes, GPU timers where available, draw/triangle/texture/geometry counters, collider/body counts, loading/integration queues, source texture estimates and Windows GPU allocations. Actual evidence and raw trace JSON are kept under artifacts/phase8.

## Current verification scope — 18 October 2026

The user authorized launching the game, superseding the earlier offline-only restriction. Live testing found and fixed missing first-use prop/flight shader preparation, HIGH/ULTRA target variants and a real recessed-exit breakthrough collision. 58/58 offline tests and the production build pass. Full browser run 46/47 was followed by successful 12/12 targeted repeats after the exit fix. Latest unique case coverage is 47 passing cases.

The 28-scene measurement matrix, 55 screenshots, two recordings and production LOW/HIGH smoke are recorded in [PHASE8-LIVE-VERIFICATION.md](PHASE8-LIVE-VERIFICATION.md) and [the review](../artifacts/phase8/live-2026-10-18/review.html). No upload/deployment was performed.

The final art standard and zero-stutter goal are not certified: occasional slow frames, significant initial preparation, simplified corridors/collapse, sparse rubble and uneven street-prop quality remain documented.
