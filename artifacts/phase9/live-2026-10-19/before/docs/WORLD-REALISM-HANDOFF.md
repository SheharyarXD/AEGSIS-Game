# AEGIS world realism implementation - 15 October 2026

Street and VFX update integrated into the current main game. Review: artifacts/world-realism/review.html. Ten-point starting audit: docs/WORLD-REALISM-AUDIT.md.

## Changes

- src/world/ArchitectureDestruction.ts
- src/world/City.ts
- src/world/EnvironmentalDestruction.ts
- src/world/environment/ArchitecturalLights.ts
- src/world/environment/ArchitectureImpactEffects.ts
- src/world/environment/AssetLibrary.ts
- src/world/environment/Atmosphere.ts
- src/world/environment/EnvironmentMaterials.ts
- src/world/environment/UrbanSurfaces.ts
- src/world/environment/StreetMaterials.ts (new dedicated ground materials)
- src/world/environment/StreetSigns.ts (new shared original sign atlas)
- src/world/environment/WetStreetReflections.ts (new bounded source-atlas wet proxies)
- tests/world-realism.test.ts and tests/world-realism.browser.spec.mjs
- playwright.world-realism.config.mjs
- art/environment/world-realism/*, public/assets/environment/metropolis/street-details-optimized.glb and concrete PBR maps
- scripts/world-realism-*.mjs (audit, capture, profiling, packaging, report)

## Art and lighting

One authored reading/waiting corner on the X=232 avenue; deterministic curb, entrance and industrial service sockets propagate the kit through the five districts. Existing roads, source-building locations, landmark hierarchy, collision surfaces, weather states and gameplay remain. 512px original aggregate concrete maps add visible surface grain; road patch/noise, worn paint, stop bars, turn arrows, curb gaps and slab joints use dedicated materials. A fixed budget of 2 LOW / 4 other-tier local lights follows street lamps. Night reflections combine existing source-atlas ground proxies with warm fixture streaks, not a second scene render.

## VFX and destruction

Four pooled GPU batches; particle caps LOW64/MED112/HIGH176/ULTRA256; max12 fires, max96 scorch records, three flame tongues per fire. Source-owned ray projection fixes tapered-facade blast positions and searches nearby surviving geometry after wall loss. Temporarily missing collider queries hide attachments while retrying; this avoids a one-frame query miss discarding a valid rim effect. Full collapse clears attachments, while free dust/smoke dissipates independently. Structural dust is emitted only at bounded floor intervals. Near dynamic debris keeps the existing16/24/32/40 caps and static/settle logic. Canopy collision is at its actual elevated height; other rotated fixtures have rotated colliders.

## Performance and tests

| Tier | Scene | Before FPS | After FPS | After p95 ms | After mean draws |
|---|---|---:|---:|---:|---:|
| LOW | street-traversal | 144.0 | 137.5 | 7.1 | 101.5 |
| LOW | night-rain | 144.0 | 120.9 | 13.9 | 107.0 |
| LOW | destruction-stress | 139.0 | 138.0 | 7.1 | 122.9 |
| MEDIUM | street-traversal | 101.8 | 86.6 | 14.0 | 128.0 |
| MEDIUM | night-rain | 79.2 | 70.2 | 20.8 | 133.0 |
| MEDIUM | destruction-stress | 110.5 | 93.2 | 14.0 | 163.0 |
| HIGH | street-traversal | 82.6 | 68.0 | 20.9 | 244.0 |
| HIGH | night-rain | 60.5 | 57.8 | 20.9 | 256.0 |
| HIGH | destruction-stress | 85.5 | 69.2 | 20.8 | 298.8 |
| ULTRA | street-traversal | 79.0 | 68.2 | 20.8 | 248.0 |
| ULTRA | night-rain | 70.5 | 57.8 | 20.9 | 260.0 |
| ULTRA | destruction-stress | 85.0 | 68.7 | 20.9 | 316.9 |

GTX750Ti2GB, hardware Chrome,1280x720,DPR1,180 warm frames,6sec measured actual gameplay, fresh process per sample. LOW.85 scale, others1 atDPR1; preserve original HIGH/ULTRA AO/shadows. Single-run timing; LOW reaches~144Hz cap. Raw data and counters: artifacts/world-realism/performance-{before,after}/results.json. Added street detail and effects cost frame rate in these720p samples; the exact before/after values are shown rather than presented as a speedup. Native1080p LOW samples: performance-after-native-1080p/results.json. Browser GPU memory figures are post-run allocations, not peak resident memory.

31 protected gameplay source files match the captured working state. No src outside world changed. Existing DamageIndex, CollisionTriangles, WorldCollision, WorldStreaming and latest character/HUD source were preserved. Browser results: artifacts/world-realism/browser-results.json. Unit check:30/30 passed; raw output artifacts/world-realism/unit-tests.txt. Production build passed (existing large bundle warning).

## Evidence

13 exact-coordinate before/after PNG pairs in artifacts/world-realism/{before,after}. Unedited street-and-destruction.webm files show actual F missile and L laser input with the current hero/HUD; only final structural demonstration uses QA support damage. LOW clip uses real W/E/Space input and records position/state transitions. Screenshot architecture cameras are QA fixtures; photographs hide the hero, weapon/LOW footage retains it. Capture JSON contains errors, settings and poses.

## Assets and licensing

Original editable kit: art/environment/world-realism/urban-details.blend; source:build_street_details.py. Ten modules,7376 source triangles,148320 compressedGLBbytes. Original concrete generator and16bitheight source retained;3WebPmaps512px. New license notes:art/environment/world-realism/LICENSES.txt and runtime WORLD-REALISM-LICENSES.txt. Existing CC BY4 buildings/props and CC0 Quaternius attribution retained in public/assets/environment/metropolis/LICENSES.txt and ATTRIBUTION.txt. No extra third-party asset downloaded in this pass. Full source building meshes were retained.

## Run

Start npm.cmd run dev -- --host 127.0.0.1 --port 5192 --strictPort, then open http://127.0.0.1:5192/artifacts/world-realism/review.html. The hero-block button opens actual walking/flight gameplay at248,.3,-430; main game remains at /. QA controls require?qa=1. Eflight,Spaceclimb,WASDmove,Shiftboost,Fmissiles,Llaser,Ttransformation. Rebuild using npm.cmd run build. Re-run full regression via node node_modules/@playwright/test/cli.js test --config playwright.world-realism.config.mjs while server5192 is running. Packaging:node scripts/world-realism-allowlist.mjs then node scripts/world-realism-package.mjs. Fresh local static bundle at artifacts/world-realism/deploy (not uploaded).

## Known limitations

Existing vehicle and some vegetation/prop geometry remain stylized; the evidence does not justify claiming AAA visual completion. Source-atlas wet proxies omit dynamic characters/cars and exact view-dependent reflections. Smoke uses noise billboards, without scene-depth soft intersection or volumetric lighting. Facade damage follows authored component boundaries rather than arbitrary runtime fracture. Existing damage serialization/streaming persistence remains; no new cross-session save feature. Dense traffic and pedestrian AI were not rebuilt. Timing covers three representative scenes per tier rather than every weather/gameplay combination; native1080p coverage is LOW. Native1080pLOW measured82.9FPSstreet,71.2FPSwetnight,91.7FPSdestruction; LOW internal1632x918. HIGH/ULTRAwetnight720p measured57.8FPS. The full local package includes both texture alternatives and all families, about269MiB: it is not a portal-certified download budget. Large physics/Three.js bundles remain. No publishing was requested or performed.
