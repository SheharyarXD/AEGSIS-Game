# Phase 8 live verification — 18 October 2026

The user explicitly authorized launching the game, superseding the earlier offline-only instruction. No upload or deployment was requested or performed.

Live review: [screenshots, videos and raw results](../artifacts/phase8/live-2026-10-18/review.html).

58/58 Node/Rapier regressions, TypeScript and production build pass. The full browser run passed 46/47 before fixing the recessed mid-rise exit. Post-fix targeted repeats passed 12/12, covering all three physical breakthroughs and persistence/collapse. Latest unique coverage is 47 passing cases; this is not a claim of a single clean full-suite run. Final matrix and production smoke recorded no browser/HTTP/shader errors.

## Runtime fixes

Initial cold-entry traces showed mailbox (160 ms), street-label (140 ms) and flight-effect (34 ms) first-use shader work. AssetLibrary now includes props and labels in warm-up, serializes preparation, retains isolated cloned materials, prepares exact variants and uses the HIGH/ULTRA offscreen target. The live framebuffer is restored before async waiting. Final whole-scene/postprocess initialization occurs beneath the loader.

The mid-rise breakthrough hit its still-closed recessed exit at progress 23.71/27.87 m. Opening now uses reserved exit collider bounds plus a two-step travel margin. The original capsule/controller remain enabled; both directions and three approach phases have regression coverage.

## Final 720p-viewport measurements

| Tier / scene | Viewport → render | FPS | p50 / p95 / p99 ms | Worst ms | >50 ms |
|---|---|---:|---|---:|---:|
| LOW / cold-flight | 1280×720 → 1088×612 | 141.3 | 6.9 / 7.0 / 13.9 | 62.4 | 1 |
| LOW / warm-flight | 1280×720 → 1088×612 | 139.4 | 6.9 / 7.1 / 13.9 | 14.0 | 0 |
| LOW / street-traversal | 1280×720 → 1088×612 | 144.0 | 6.9 / 7.1 / 7.1 | 7.1 | 0 |
| LOW / rooftop-traversal | 1280×720 → 1088×612 | 144.1 | 6.9 / 7.1 / 7.1 | 7.1 | 0 |
| LOW / aerial-traversal | 1280×720 → 1088×612 | 144.0 | 6.9 / 7.0 / 7.1 | 13.9 | 0 |
| LOW / rain-night | 1280×720 → 1088×612 | 143.2 | 6.9 / 7.0 / 7.1 | 14.0 | 0 |
| LOW / combat | 1280×720 → 1088×612 | 112.5 | 7.0 / 13.9 / 14.0 | 14.1 | 0 |
| LOW / first-hit | 1280×720 → 1088×612 | 111.9 | 7.0 / 13.9 / 14.0 | 41.7 | 0 |
| LOW / rain-collapse | 1280×720 → 1088×612 | 136.7 | 6.9 / 7.1 / 14.0 | 55.6 | 1 |
| MEDIUM / cold-flight | 1280×720 → 1280×720 | 114.6 | 7.0 / 13.9 / 14.0 | 48.6 | 0 |
| MEDIUM / street-traversal | 1280×720 → 1280×720 | 104.6 | 7.0 / 13.9 / 14.0 | 14.0 | 0 |
| MEDIUM / rain-night | 1280×720 → 1280×720 | 83.9 | 13.8 / 14.0 / 14.0 | 14.0 | 0 |
| MEDIUM / rain-collapse | 1280×720 → 1280×720 | 91.3 | 7.1 / 20.8 / 27.9 | 76.4 | 1 |
| HIGH / cold-flight | 1280×720 → 1280×720 | 87.7 | 13.8 / 14.0 / 20.8 | 55.6 | 1 |
| HIGH / street-traversal | 1280×720 → 1280×720 | 81.3 | 13.9 / 14.0 / 14.0 | 27.7 | 0 |
| HIGH / rain-night | 1280×720 → 1280×720 | 70.1 | 13.9 / 20.8 / 20.9 | 20.9 | 0 |
| HIGH / rain-collapse | 1280×720 → 1280×720 | 72.6 | 13.9 / 20.9 / 34.7 | 69.5 | 1 |
| ULTRA / cold-flight | 1280×720 → 1280×720 | 86.1 | 13.8 / 14.0 / 20.8 | 55.6 | 1 |
| ULTRA / street-traversal | 1280×720 → 1280×720 | 76.5 | 13.9 / 14.0 / 14.1 | 20.9 | 0 |
| ULTRA / rain-night | 1280×720 → 1280×720 | 64.9 | 13.9 / 20.9 / 20.9 | 21.0 | 0 |
| ULTRA / rain-collapse | 1280×720 → 1280×720 | 69.0 | 13.9 / 20.9 / 34.7 | 62.4 | 1 |

## Baseline and native 1080p LOW

| Tier / scene | Viewport → render | FPS | p50 / p95 / p99 ms | Worst ms | >50 ms |
|---|---|---:|---|---:|---:|
| LOW / cold-flight | 1280×720 → 1088×612 | 49.9 | 6.9 / 7.1 / 138.8 | 3812.7 | 5 |
| LOW / street-traversal | 1280×720 → 1088×612 | 144.1 | 6.9 / 7.1 / 7.1 | 7.1 | 0 |
| LOW / rain-night | 1280×720 → 1088×612 | 141.9 | 6.9 / 7.1 / 13.9 | 20.8 | 0 |
| LOW / first-hit | 1280×720 → 1088×612 | 57.6 | 7.0 / 14.0 / 14.0 | 3798.6 | 1 |
| LOW / rain-collapse | 1280×720 → 1088×612 | 88.2 | 6.9 / 7.1 / 14.0 | 3527.9 | 1 |
| LOW / street-traversal | 1920×1080 → 1632×918 | 98.1 | 7.1 / 14.0 / 14.0 | 14.1 | 0 |
| LOW / rain-night | 1920×1080 → 1632×918 | 80.2 | 13.9 / 14.0 / 14.0 | 14.1 | 0 |

Single fresh hardware Chrome per scene, no recording during timing; exact RAF frames in raw JSON. GTX 750 Ti 2 GB via ANGLE/D3D11. LOW uses 0.85 render scale; other tiers use 1.0 at DPR 1. Samples are short and single-run, not guaranteed minimum FPS. The desktop and unrelated apps remained running. GPU allocation is an end-of-scene point sample, not peak residency. Counters, long tasks, positions, queue work, GPU timings and heap are retained.

## Evidence and scope

55 actual browser PNGs, two unedited silent videos. Nine paired MEDIUM architectural views use identical QA cameras and hide the hero. Actual keys drive weapons, suit, run/flight and three breakthroughs. Starting positions and weather are fixtures. Partial/full-collapse and LOW stress media use explicitly scripted support damage through normal destruction. The baseline is the saved pre-Phase-8 source, which already contains real supplied models; these comparisons do not represent the older primitive city.

## Preservation and assets

12 protected player/HUD/camera/audio/input/physics sources and 15 external originals match their saved hashes. 971 fixed buildings, 25 source families, five districts and 2048×2048 m remain. New original supplemental Blender kit: 15 modules, 8 shared materials, 13160 triangles, 185912 byte optimized GLB. Existing licenses remain in public/assets/environment/ATTRIBUTION.txt and metropolis/LICENSES.txt; new work notice is metropolis/PHASE8-LICENSES.txt. No new third-party model was downloaded.

Full Phase-8 source changes: [preservation.json](../artifacts/phase8/preservation.json). This live continuation: [changed-files.json](../artifacts/phase8/live-2026-10-18/changed-files.json). Earlier legacy generated gameplay reports refreshed during the first browser run are recorded in legacy-initial-gameplay/PROVENANCE.txt.

## Limitations

- These are short, single-run samples on a GTX 750 Ti 2 GB, with the desktop and other user applications still running. They establish measured behavior, not a minimum-FPS guarantee. LOW uses 0.85 rendering scale; other tiers use 1.0 at device DPR 1.
- Cold entry and stress frames can exceed 50 ms. Initial asset/shader preparation remains significant. No zero-stutter or Poki/CrazyGames certification is claimed.
- GPU allocation counters were sampled after each timed scene. They are point measurements, not peak VRAM. Machine totals include the desktop and unrelated applications.
- Intact architecture remains the supplied source models. Streets still have broad, quiet stretches, stylized trees/props and visible repeated families. Night surfaces do not provide full scene reflections. This is not a completed premium visual art pass.
- Damage follows authored sections and an approximate support graph. Collapse removes those sections in stages; the final ruin can be sparse under strict debris caps. It is not continuous mesh fracture or a physically complete structural simulation.
- Breakthrough corridors have repeated exposed frame/floor dressing, not fully furnished building interiors. Smoke/fire use pooled billboards. Active body, effect, scar and corridor caps deliberately discard excess detail.
- Streaming preserves destroyed state in memory and the snapshot API restores it. There is no new automatic cross-session save UI. Large Rapier/Three.js chunks and the full asset download remain deployment work.

## Run

Start with `npm.cmd run dev -- --host 127.0.0.1 --port 5192 --strictPort`; open http://127.0.0.1:5192. H opens controls, Y is aligned armored-flight breakthrough, O toggles demolition, F fires. QA hooks require /?qa=1. Ordinary gameplay exposes read-only aegisDiagnostics(). Repeat offline checks with node scripts/phase8-verify-offline.mjs; browser config and guarded live performance scripts are recorded in the HTML report.
