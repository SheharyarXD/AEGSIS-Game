# AEGIS metropolis redesign — implementation and evidence

The MAIN game now uses a saved five-district city with 971 placements, 204 blocks and 25 complete source families. Original source architecture replaces the former repetitive assemblies; the deployment bay, checkpoint/court, bridge/ramp, character, HUD, combat, camera and input integrations are retained.

## What changed and why

- Fixed avenue/local-road hierarchy, source-footprint frontage, service alleys, protected mission reservations, financial height clusters and selected glass/Gothic/Art Deco landmarks. Footprint coverage rises from 12.55% to 25.16%. Two complete Gothic spires replace the old 159 Gothic filler placements. The saved layout is authoritative; runtime streaming does not randomly invent towers.
- Blender-authored street kit and original Meridian Arcade assembled from licensed CC0 source modules: genuine panes, facade/cornice details, entrances, roof service structures and independent damage IDs. Standard sources retain their UVs/normals/materials and uniform scale; the sixteen preserved deployment lots keep their existing proportions.
- Road asphalt, lane/stop/crosswalk paint, modular paving/curbs, corner ramps, utility covers, drains, tree pits, signals, meters, PBR furniture and bounded traffic/civilians follow the street plan. Road/parcel validation finds 0 intrusions and 0 overlaps.
- Complete source near meshes, conservative medium LODs and five Blender-rendered source views per family in one atlas. Batched shared HLOD uses multi-draw where supported and family instancing elsewhere. Frustum/distance culling, smaller nearby source ranges, bounded sectors and surface-distance roof selection reduce distant geometry cost.
- Shared BC3 DDS maps with WebP fallback; duplicate embedded image payloads removed from runtime GLBs, with standalone embedded-PBR exports retained for inspection. Street maps are 512 px; source authoring keeps higher-resolution maps. Startup no longer loads all unused/far source GLBs. Runtime source families are filtered to the 25 actually used.
- Layered localized scorch/glass/chips, pooled side-oriented flame/smoke/sparks, actual source-section index removal and sparse local collision. Heavy panels use source vertices/UVs rather than generic cubes. Support failure produces partial cascades; only buildings 211, 235, 287 and 9014 permit full collapse. Dynamic architecture debris caps are 16/24/32/40; effect caps scale with quality.
- Damaged detail cools beyond 330 m and rehydrates inside 220 m. Broken section/HP records survive streaming, distant burned proxies remain visible, and source holes/collision restore nearby. Settled/far debris retires; full collapses stop submitting removed source triangles.
- Removed circular water/shore boundary; east harbor, irregular continuous mainland, distant source silhouettes and filtered water plus atmosphere replace it. Clear/cloudy/overcast/fog/rain/thunderstorm/night/dawn states use existing GPU weather with visibility fixes.

## Source and integration preservation

All 31 non-world source files match the pre-redesign snapshot. This includes Claude's character/pilot/suit/animation/HUD/input/weapon/mission/physics implementation. All 15 inspected supplied originals match their saved SHA-256 hashes. Historical root regression artifacts have been restored; this work's evidence is isolated under artifacts/city-redesign. Existing unrelated Git changes remain in place; no commit/reset/clean was made.

World source files changed relative to the task snapshot:

- `src/world/ArchitectureDestruction.ts`
- `src/world/City.ts`
- `src/world/CityLayout.ts`
- `src/world/DestructibleFamilies.ts`
- `src/world/environment/ArchitecturalLights.ts`
- `src/world/environment/AssetLibrary.ts`
- `src/world/environment/Atmosphere.ts`
- `src/world/environment/CityInfrastructure.ts`
- `src/world/environment/EnvironmentMaterials.ts`
- `src/world/environment/PremiumMaterials.ts`
- `src/world/environment/UrbanAmbience.ts`
- `src/world/environment/WeatherState.ts`
- `src/world/EnvironmentalDestruction.ts`
- `src/world/FixedCityLayout.ts`
- `src/world/WorldCollision.ts`
- `src/world/WorldStreaming.ts`

New authoring/runtime modules include CityPlan, UrbanSurfaces, ArchitectureImpactEffects and the city-redesign scripts. Test changes isolate this task's output, use actual authored collision, wait for simulation targeting rather than a fixed wall-clock delay, and test optimized world collider coverage/disposal. The saved layout/catalog, shared atlas/textures, 50 runtime LOD GLBs and street kit are changed/generated assets. See asset-layout-audit.json and deployment.json for the exact runtime file list.

## Assets and licenses

London and Singapore skyscrapers: 99.Miles; Aria Gothic tower: ChamberSu1996; downtown/industrial sets: Daniel Zhabotinsky; Art Deco Citadel: Samuel Francis Johnson / Oneironauticus; PBR street props: MadeByYeshe. These supplied sources declare CC BY 4.0; full author/source links and modification notes are retained in public/assets/environment/ATTRIBUTION.txt and metropolis/LICENSES.txt. Quaternius Downtown MegaKit [Standard] is CC0; the supplied license is preserved. Original AEGIS architectural compositions and street modules are saved as editable Blender files. Other supplied models are inspected but unused; ambiguous/incompatible packs are excluded from runtime.

Actual files:

- art/environment/city-redesign/metropolis-master-layout.blend — complete source models as linked placement instances.
- art/environment/city-redesign/metropolis-street-kit.blend — street furniture/surface modules and authored civilian.
- art/environment/city-redesign/metropolis-hlod.blend — packed real source atlas and metre-scale family gallery.
- art/environment/city-redesign/families/city_meridian_arcade-{source,destructible}.blend — original commercial source/damage preparation.
- art/environment/phase7/provided/{aer_glass,aer_gothic}-{source,destructible}.blend — actual modern/Gothic source and damage preparations.
- art/environment/phase7/city/*-{source,destructible}.blend — remaining complete source families.
- artifacts/city-redesign/embedded-texture-backup/*-{near,mid}-optimized.glb — 50 standalone embedded-PBR LOD GLBs. Runtime equivalents intentionally use shared maps through the game loader.
- art/environment/city-redesign/fractured/ — nine inspectable source-derived fractured GLBs for modern, Gothic and authored commercial families, including embedded PBR. Live destruction selects section IDs dynamically rather than loading all these inspection copies.

## Actual performance

GTX 750 Ti 2 GB, Chrome/ANGLE Direct3D11, 1280 × 720 viewport, DPR 1, 180 warm-up frames, then six seconds per scene in a fresh isolated Chrome process. LOW internal size 1088 × 612; MEDIUM/HIGH/ULTRA 1280 × 720 because the preserved renderer caps pixel ratio to device DPR. This does not measure the HIGH/ULTRA 1.25/1.5 scales on a high-DPI display. Average FPS is 1000 / average frame interval; p95 and every hardware reading are in the raw report. Other desktop applications remain open; benchmark browser VRAM is isolated where Windows supplies the counter.

| Quality | Street | Roof | Wet night | Aerial | Combat | Destruction | Browser dedicated memory point range |
|---|---:|---:|---:|---:|---:|---:|---:|
| LOW | 144.0 | 134.0 | 144.0 | 144.0 | 118.0 | 136.3 | 234–297 MiB |
| MEDIUM | 120.3 | 101.2 | 98.5 | 144.0 | 77.2 | 118.3 | 272–343 MiB |
| HIGH | 91.7 | 85.4 | 79.7 | 81.5 | 67.5 | 88.3 | 388–449 MiB |
| ULTRA | 89.5 | 56.1 | 78.2 | 69.3 | 67.7 | 87.0 | 387–453 MiB |

The review shows exact before → after values for all 24 samples, p95 frame times and draws. On the original scene, LOW street submitted about 1.11 million triangles/133 draws and combat about 4.24 million/358 draws; higher-tier shadow/AO passes increased this further. Low average simulation times compared with total frame times identified rendering as the dominant cost. Geometry/material sharing, far representation and culling target that bottleneck; collision/effect caps reduce secondary CPU and stress costs. Timing includes real walking/flight/combat and first destruction activation, not a static render-only estimate. It does not certify every possible combat or streaming hitch.

An additional 1920 × 1080 viewport / DPR 1 pass measures street, heavy-rain night and combat in all four tiers. LOW renders 1632 × 918, other tiers 1920 × 1080. These are supplemental rebuilt-city results, not before/after comparisons:

| Quality | Street FPS | Wet-night FPS | Combat FPS |
|---|---:|---:|---:|
| LOW | 112.2 | 93.7 | 71.1 |
| MEDIUM | 72.1 | 52.5 | 48.6 |
| HIGH | 49.8 | 43.4 | 38.0 |
| ULTRA | 49.6 | 43.1 | 38.2 |

Raw native-resolution diagnostics: artifacts/city-redesign/performance-after-1080p/results.json.

## Validation and evidence

Production build passes. Six physics and eleven environment/recovery checks pass. The latest 35 browser check outcomes pass. A complete 34-case invocation passed before the final signage check; the later 35-case run passed 34 and exposed the counter setup's borderline distance again. Its target is now 1.55 m and two focused repeats pass. Character/melee code stays unchanged. The full failed report and both focused results are retained; this is not presented as one clean 35-case invocation. The ordinary production package URL is checked separately for loading, attribution, deploy/skip, walking, takeoff/flight and pause/resume without exposing mutation hooks.

Open artifacts/city-redesign/review.html for the 10 new district/ground/roof/skyline/weather photos; all 10 matched old/new camera pairs; same-input before/after LOW walking, wet night and MEDIUM flight recordings; all five source damage stages for each of three buildings; and actual L/F keyboard weapon footage with pooled fire/smoke. Architecture-only photos hide the hero/jet material; videos retain character/HUD. Damage-stage helpers exercise actual section HP/support/physics; they are clearly labeled and separate from real weapon footage. Raw poses, weather, damage records, counters and errors are stored alongside the media.

## Known limits

- This is a substantial source-asset city and destruction rebuild, not a claim of photorealistic or AAA art completion. Some standard pack facades use baked window details, trees/civilians remain stylized, and the saved street grid is still predominantly orthogonal.
- Near buildings use source geometry. Far buildings use five source-view alpha-tested cards; oblique views and transitions simplify depth and roof detail. Distant damage is a burned/height-adjusted approximation; actual section holes return nearby.
- Collapse is a support-triggered sector/floor cascade with a few source-shaped falling panels and pooled chips. It is not engineering stress analysis or rigid-body simulation of every floor. Four showcases permit full collapse; ordinary buildings support localized section damage.
- Damage persists during streaming and can be serialized. There is no new save-slot/UI persistence across browser reloads. Foundations, roads, bridge/deployment fixtures and civilians do not run full destruction logic.
- Traffic and civilians provide bounded local movement, rather than full traffic/pedestrian AI. Wet reflections are material and light-proxy approximations; no ray-traced reflections.
- The static package is 245.9 MiB including both DDS and WebP alternatives. Detailed assets load on demand. This remains a substantial download; platform SDK integration, mobile certification and a Poki/CrazyGames upload are not included.
- The benchmark is one isolated six-second sample per scene and tier on the installed GTX 750 Ti. It reports average and p95 frame time, not a guaranteed minimum FPS. Headless Chrome at DPR 1 does not exercise HIGH/ULTRA pixel ratios above 1. Windows memory readings are point samples including browser driver allocations.

Do not label this a final AAA/photorealistic city or platform-certified Poki/CrazyGames release. The runtime package is smaller and streams source detail, but it remains a sizable asset bundle. Keep these qualifications with the performance report.

## Run and reproduce

Main game: npm.cmd run dev -- --host 127.0.0.1 --port 5192, then http://127.0.0.1:5192/. Settings select LOW/MEDIUM/HIGH/ULTRA. QA capture hooks require /?qa=1; ordinary gameplay URLs expose only read-only diagnostics.

Checks: npm.cmd test; npm.cmd run test:environment; npm.cmd run build; npx.cmd playwright test --config playwright.city-redesign.config.mjs (main Vite server running).

Media: node scripts/city-redesign-capture.mjs; node scripts/city-redesign-damage-capture.mjs; node scripts/city-redesign-weapons-video.mjs; node scripts/city-redesign-gameplay-video.mjs. For matched original media use CITY_CAPTURE_STAGE=before and AEGIS_BASE_URL=http://127.0.0.1:5195 with the saved baseline config. Do not benchmark while another browser capture/Blender GPU task runs.

Performance: node scripts/city-redesign-performance.mjs. Optional CITY_PROFILE_TIERS / CITY_PROFILE_SCENES select samples; CITY_PROFILE_STAGE / AEGIS_BASE_URL select the preserved baseline. Preserve the six-second method and actual resolutions.

Production: npm.cmd run build; python scripts/city-redesign-asset-manifest.py; node scripts/city-redesign-package.mjs; serve artifacts/city-redesign/deploy. The exact allowlist excludes source/unused assets and development media. No external platform publication occurred.

Authoring: tools/blender-4.5.14-windows-x64/blender.exe --background --python art/environment/city-redesign/master_layout.py. Re-export intact source LODs with existing source_lods.py then Meshopt optimization and shared-map preparation. Keep original external GLBs immutable. The runtime texture-strip script retains embedded inspection copies; do not overwrite those with placeholders. Do not rerun old Phase 6/7 layout/install experiments over this saved city.
