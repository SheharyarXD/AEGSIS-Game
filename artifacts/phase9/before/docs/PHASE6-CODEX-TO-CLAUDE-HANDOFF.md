# Phase 6.5 ? Codex to Claude handoff

**The expanded world is integrated into MAIN. Continue unfinished Phase 5 character animation, combat-body rotation, full-body aiming and tactical HUD work from the current files.**

Final destination: `C:\Users\XD GAMING\Downloads\Work\Agesis Game`. The default game uses the city; the environment worktree is a recovery/source reference. Main build, unit tests, all 24 browser tests and ordinary dev/production URLs were verified. No character model was rebuilt.

## Preservation and Git

Main branch remains `main`, HEAD `784838c0102091d688a5bcf28ef297d1a519af56`. No commits, stash, reset, clean, checkout or cherry-pick were performed. Original staged diff was empty. Character, physics, camera, combat, audio, input, VFX, HUD, existing tests, hero/pilot GLBs, Blender sources, ignored art exports, original README and .gitignore are preserved byte for byte. The final checksum audit covers 913 original files; the three authorized replacements/semantic merges are listed below. Regression outputs were copied into `artifacts/phase6-integration/regression-output/`, then Claude's original artifact contents were restored.

Verified backup: `C:\Users\XD GAMING\Downloads\Work\Aegis-Integration-Backups\20261011-124733`. It contains 916 working-state files (873,248,633 bytes), SHA-256 inventory, staged/unstaged binary diffs, untracked/ignored inventories and a Git metadata snapshot. `RESTORE.md` explains file-level recovery. Reproducible node_modules, tools, dist and test-results were excluded. Rehearsal: `C:\Users\XD GAMING\Downloads\Work\Aegis-Integration-Rehearsal-20261011-124733`, a faithful filesystem copy with independent npm dependencies.

Environment branch: `feature/aegis-cinematic-open-world`, preserved in `C:\Users\XD GAMING\Downloads\Work\Agesis-Environment`.

- `0cba83dd429f82812c3de20ff05837f1b6b2851b` ? authored city, atmosphere, weather and environment validation.
- `42d722890c7a56b911952ae3845b7b3d71678768` ? old-baseline environment bootstrap wiring.

These commits were content references. Their old `src/main.ts` was not copied. Historical ENVIRONMENT documentation/manifests describe the isolated branch; this handoff and `integration-manifest.json` describe main. There are no unresolved Git conflicts. All integrated work remains uncommitted for review; review paths/hunks deliberately when committing.

## Architecture

2048 ? 2048 metre world; 632 Blender-module building placements, two original landmarks and 16 retained deployment-area buildings. Five districts: Crown Exchange, Saint Vesper, Ironwake Docks, Prism Mile and Meridian Gardens. CityLayout uses seed 4197, coherent streets, reserved plazas/parks and a protected spawn/training/mission court. Existing enemy, boss and mission locations remain navigable and unchanged.

`City.ready` loads the complete authored kit and PBR maps before gameplay starts. WorldStreaming keeps persistent distant authored silhouettes and bounded detailed tiles (LOW/MEDIUM/HIGH/ULTRA: 9/16/22/28), with 2.4 s flight lookahead and one tile built per frame. Detailed tiles now share reusable instance pools by authored module/material. WorldCollision keeps 6770 simplified building/roof colliders resident, independent of render loading. Infrastructure/bay add the floor, bridge, ramps, sidewalks and landmark/industrial support. Colliders remain identical across quality levels.

The old global ceiling and perimeter cage are absent. The deployment floor retains its original contact dimensions, with non-overlapping surrounding floor patches of at most 256 m. This avoids both overlapping floors and contact precision loss from a single enormous floor. WorldRecovery remembers valid ground/roof landings and returns actors after water falls below -5 m or horizontal escape beyond ?1200 m. There is no altitude ceiling; 367 m actual input flight and a 15000 m recovery-unit check passed.

Atmosphere owns the single active sun/moon, sky, clouds and fog. WeatherState implements ten presets, independent time and a 20-minute normal-play day. GPU precipitation, wet/snow material response, original lighting/signs, ambience and a bounded separate environmental audio graph are included. Normal play advances time; QA freezes it. Preview presets through `?weather=heavy-rain&hour=23`; development controls through `?envDebug=1`.

## Shared files and interfaces

- `src/main.ts`: semantic additions around Claude's current bootstrap: await city.ready; extended camera far plane; camera/velocity/activity supplied to city.update; city.reset on restart; environmental audio toggle/mute; readonly environment/collider diagnostics and F3 text; safe QA teleport/edge recovery; pagehide/HMR environment cleanup and compositor-pass disposal. Player root, both forms, assembly, render interpolation, weapons, targeting, effects, HUD, audio, missions and boss callbacks remain. Before fixed-step weapon sampling, the active character object is placed at its physics origin; display interpolation still happens afterward.
- `package.json`: retained dependencies and existing scripts; added environment, integration, capture and performance commands; verify includes the environment and complete browser suite. package-lock is unchanged.
- `src/world/City.ts`: untouched by Claude before integration; replaced with the compatible environment City contract.

Environment additions were subsequently refined in WorldStreaming (shared instance pools), DeploymentBay/CityInfrastructure (floor ownership/contact scale), CityLayout (industrial debug landing point), WorldRecovery (safe recovery), environment utilities (main URL), and historical report documentation. Renderer shadow maps update once per frame, so GTAO's normal pass reuses the beauty pass's shadows. Rehearsal HIGH combat improved from 70.36 ms / 989 draws to about 23?24 ms / about 400 draws, preserving asset detail and original quality settings. Dirty-main baseline for that scene was 23.68 ms.

Keep the City exports SPAWN, COURT, COURSE, courseRings, sun, hangarLights, setAssemblyLight, ready, reset, update and dispose contracts. Use existing Settings to change whole-game quality (reload). City.setQuality changes streaming/ambience; lab overrides do not rebuild the compositor. QA mutation hooks remain opt-in; ordinary URLs expose readonly diagnostics.

## Editable assets and licenses

- [Editable environment Blender library](../art/environment/aegis-environment.blend) ? 2,970,340 bytes; asset gallery and export collections.
- [Blender Python builder](../art/environment/build.py) and [pipeline README](../art/environment/README.md).
- [aegis-city-kit.glb](../public/assets/environment/aegis-city-kit.glb) ? 2,935,140 bytes
- [aegis-landmarks.glb](../public/assets/environment/aegis-landmarks.glb) ? 1,464,668 bytes
- [aegis-skyline-lod.glb](../public/assets/environment/aegis-skyline-lod.glb) ? 934,884 bytes
- [Original authored geometry manifest](../public/assets/environment/authored-manifest.json).
- [Atlas provenance](../public/assets/environment/atlas-manifest.json).
- [External texture provenance and URLs](../public/assets/environment/external-manifest.json) and [Poly Haven CC0 license](../public/assets/environment/LICENSE-PolyHaven.txt).

All three GLBs passed actual normal/UV validation. Near kit: 85 meshes, 14 materials, 24,653 unique triangles. Focused skyline LOD export: 20 meshes / 634 triangles. Landmarks: 7 meshes / 7,217 triangles. Runtime caches the full kit, which contains the near/far modules and landmarks. Architecture and props are original Blender assets. The acquired assets are Asphalt 02 maps by Rob Tuytel / Poly Haven, optimized to 512 px WebP. No acquired third-party 3D model was used. The full editable sources and licenses are present in main.

## Actual validation

- TypeScript and production build: PASS; [build log](../artifacts/phase6-integration/main-build.log).
- Existing physics units: 6/6 PASS; [log](../artifacts/phase6-integration/main-physics-tests.log).
- Environment/recovery units: 11/11 PASS; [log](../artifacts/phase6-integration/main-environment-tests.log).
- Actual main browser suite: 24/24 PASS, 0 skipped, 0 unexpected, 0 flaky in the final run; [results](../artifacts/phase6-integration/merged-browser-results.json). This includes all 13 unchanged current main tests, six environment tests and five new compatibility checks.
- Original tests cover forms/assembly, flight/climb/dive/banking, gravity/graded landings, melee combinations/counter/dash, guidance/LOS, palm weapons and beam audio lifecycle, ragdolls/fracture, menus/HUD, mission/boss/finisher/restart.
- Environment checks cover all districts, ten presets, solar/material/particle response, collision during absent detail, repeated traversals, quality invariance, safe recovery, bridge/ramp/sidewalk/roof/crane landing, 200 m/s capsule sweeps, environment audio toggle and repeated complete world construction/disposal while preserving actors/checkpoint.
- Ordinary dev and production URLs passed default-world loading, real deployment/walking input, missing-resource/error checks and absence of QA mutation hooks; [smoke results](../artifacts/phase6-integration/default-and-production-smoke.json).

No merge failures remain in the final checks. The repeated pre-merge aerial strike check produced one pass and one miss; the merged repeated check did the same. Full dirty-main baseline initially passed 13/13; final main passed that case too. Treat aerial contact as an existing intermittent Phase 5 issue rather than assuming one green run makes it deterministic. Both baseline and repeated results are preserved. Long sessions, other GPUs and unsupported gameplay additions were not exhaustively tested. Vite emits a bundle-size warning for Three/Rapier; build completes.

## Combined-game performance

Actual project `C:\Users\XD GAMING\Downloads\Work\Agesis Game`, Chrome `155.0.8059.40`, NVIDIA GeForce GTX 750 Ti, headless viewport 1280 ? 720. LOW renders 1088 ? 612; MEDIUM 1280 ? 720; HIGH 1600 ? 900 with the existing AO pipeline. Each scene has 360 active-gameplay samples after warm-up, with no browser/asset errors. GPU queries were supported. [Raw measurements](../artifacts/phase6-integration/combined-performance.json).

| Scene | Quality | Median ms | Mean ms | p95 ms | FPS from mean | GPU mean / p95 ms |
|---|---|---:|---:|---:|---:|---:|
| 1. downtown-clear | LOW | 7.00 | 10.11 | 20.90 | 98.93 | 5.61 / 8.95 |
| 2. downtown-heavy-rain | LOW | 13.80 | 13.85 | 27.90 | 72.20 | 7.52 / 15.20 |
| 3. storm-flight | LOW | 7.00 | 10.38 | 13.90 | 96.36 | 4.29 / 5.26 |
| 4. high-altitude | LOW | 6.90 | 7.14 | 7.00 | 140.10 | 4.24 / 8.37 |
| 5. normal-gameplay | MEDIUM | 13.90 | 13.64 | 20.90 | 73.32 | 8.25 / 9.24 |
| 6. downtown-clear | HIGH | 27.80 | 27.22 | 34.70 | 36.74 | 23.21 / 26.12 |
| 7. night-rain | HIGH | 20.80 | 21.34 | 27.80 | 46.87 | 17.16 / 21.60 |
| 8. district-boundary-flight | LOW | 6.90 | 7.91 | 7.10 | 126.44 | 4.62 / 8.00 |
| 9. combat-three-enemies | LOW | 13.90 | 12.19 | 14.00 | 82.02 | 7.69 / 11.70 |
| 10. missiles-laser-weather | LOW | 7.00 | 10.36 | 14.00 | 96.53 | 6.25 / 10.36 |
| 11. rooftop-landing | LOW | 6.90 | 6.98 | 7.00 | 143.20 | 5.04 / 7.52 |
| 12. restart-gameplay | LOW | 7.00 | 9.86 | 14.00 | 101.44 | 7.31 / 8.12 |


| Scene | Mean draws | Frustum triangles estimate | Submitted triangles mean | Tiles min?max | Colliders min?max | Geometry + instances MiB | Texture estimate MiB | JS heap MiB |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1. downtown-clear | 56 | 230,591 | 335,899 | 9?9 | 7168?7168 | 51.50 | 174.83 | 113.01 |
| 2. downtown-heavy-rain | 58 | 235,391 | 337,243 | 9?9 | 7168?7168 | 51.50 | 174.83 | 107.53 |
| 3. storm-flight | 99 | 271,419 | 390,188 | 8?9 | 7168?7168 | 51.50 | 174.83 | 126.00 |
| 4. high-altitude | 34 | 198,013 | 280,247 | 9?9 | 7168?7168 | 51.50 | 174.83 | 130.85 |
| 5. normal-gameplay | 90 | 235,205 | 648,475 | 14?14 | 7168?7168 | 51.54 | 174.83 | 123.06 |
| 6. downtown-clear | 150 | 241,887 | 1,192,921 | 22?22 | 7168?7168 | 51.69 | 174.83 | 106.26 |
| 7. night-rain | 151 | 246,687 | 1,198,737 | 22?22 | 7168?7168 | 51.69 | 174.83 | 102.74 |
| 8. district-boundary-flight | 78 | 233,201 | 331,394 | 5?8 | 7168?7168 | 51.49 | 174.83 | 121.94 |
| 9. combat-three-enemies | 126 | 390,024 | 542,016 | 6?7 | 7171?7171 | 57.50 | 174.83 | 130.60 |
| 10. missiles-laser-weather | 86 | 382,014 | 480,190 | 9?9 | 7171?7182 | 57.50 | 174.83 | 117.42 |
| 11. rooftop-landing | 59 | 210,613 | 386,936 | 9?9 | 7168?7168 | 51.53 | 174.83 | 101.61 |
| 12. restart-gameplay | 121 | 267,791 | 384,219 | 7?7 | 7168?7168 | 51.49 | 174.83 | 105.18 |


Renderer.info triangles sum beauty, shadow and AO submissions. The separate visible-triangle figure is a CPU sphere/frustum estimate per mesh/instance, excludes hidden parents and zero-scale LOD slots, and includes potentially occluded geometry; shader-driven bounds remain approximate. Geometry/instance bytes and decoded texture sizes are estimates for city/player/encounter resources. They exclude some effects, driver allocations, render targets and shadows, and are not authoritative total VRAM. JS heap is Chrome's reported heap. Shared environment PBR maps alone are estimated at 8.39 MB.

The district-boundary sample starts in financial at z=-100 and finishes in commercial at z?45 through actual flight input. Three-enemy and weapon/weather scenarios use the latest character and effects. Controlled weapon targets freeze AI for repeatable aiming; the combat scenario keeps AI active. Rooftop descent and restart are included in their sampled windows.

## Actual main-game media

[Interactive recordings and measurements gallery](../artifacts/phase6-integration/index.html), [capture manifest](../artifacts/phase6-integration/capture-manifest.json), [decoded video frame manifest](../artifacts/phase6-integration/video-frame-manifest.json). All eleven recordings are from main, with the latest hero/pilot and current HUD visible. QA initializes selected positions/forms and controlled targets; movement, suit-up, takeoff/climb, traversal, melee and weapons use real keyboard input. These recordings are video-only; browser audio graph and cue behavior were checked separately.

Pilot walking/collision, city mechanical suit-up, 367 m climb and skyline, 187 km/h boost plus Downtown-to-Prism traversal, heavy landing on a 236.8 m central roof, active-AI melee, guided hits and blocked building LOS, repulsor/laser surface impacts, current HUD/F3, day/rain/storm/night/sunset and LOW active-enemy weather are recorded. Guided missiles hit twice; blocked targets stayed at 95 health. Normal melee recorded four hits. Street/roof/high views demonstrate one authored financial district. Stills and 33 frames decoded from the actual WebMs were personally inspected.

## Known limitations and next work

1. Continue Phase 5 from the current player, combat, camera and HUD files. Stabilize aerial fist contact against display/physics timing; preserve the main fixed-step origin alignment. Keep the existing complete test suite and diagnose the intermittent aerial check with deterministic actor/rig sampling.
2. Continue intended shoulder/arm/full-body aiming, combat rotation and tactical HUD refinements. Current unfinished HUD work is preserved; this integration does not certify all planned Phase 5 features complete.
3. Art remains a modular prototype: repeated archetypes, coarse vegetation/distant terrain and limited variation remain visible. Preserve the Blender/GLB pipeline when refining art. Cosmetic cars/trees and skyline buildings have their existing decorative/static roles; whole-city destruction, interiors and new missions were not added.
4. Maintain GTX 750 Ti responsiveness with shared material/module pools and single shadow updates. Recheck actual combined scenarios after character/HUD changes; use raw GPU and frame data before reducing detail.

No required integration task remains. Avoid rebuilding character or environment GLBs/Blender sources during routine Phase 5 animation/HUD work. Avoid reapplying old upgrade scripts or the old environment bootstrap/cherry-picks. Claude may continue `src/player/`, `src/combat/`, `src/camera/`, `src/ui/`, input/audio/VFX and corresponding tests; preserve the world interfaces when editing main. The environment branch and timestamped backup remain available.

## Run and verify

```powershell
cd "C:\Users\XD GAMING\Downloads\Work\Agesis Game"
npm.cmd install
npm.cmd run dev
npm.cmd run verify
```

Integration tests use their own strict port 5190 by default (`AEGIS_TEST_PORT` overrides it), avoiding the current main evidence server on 5188. For capture/performance, run main on 5188 or set `AEGIS_BASE_URL` to the main URL, then run `npm.cmd run capture:integration` / `npm.cmd run perf:integration`. `node scripts/integration-video-frames.mjs` decodes review frames.

## Added files

Main additions at initial transfer are recorded with sizes/checksums in [integration-manifest.json](../artifacts/phase6-integration/integration-manifest.json). Later capture/review helpers, evidence, this handoff and the final Git/preservation reports are under scripts, docs and artifacts/phase6-integration. Original shared-file integration diffs are in that directory.

- `art/environment/README.md`
- `art/environment/aegis-environment.blend`
- `art/environment/build.py`
- `art/environment/textures/atlas-color.png`
- `art/environment/textures/atlas-normal.png`
- `art/environment/textures/atlas-orm.png`
- `artifacts/environment/asset-validation.json`
- `artifacts/environment/file-manifest.json`
- `docs/ENVIRONMENT-AUDIT.md`
- `docs/ENVIRONMENT-BOOTSTRAP.patch`
- `docs/ENVIRONMENT-INTEGRATION.md`
- `docs/ENVIRONMENT-REPORT.md`
- `playwright.environment.config.mjs`
- `playwright.integration.config.mjs`
- `public/assets/environment/LICENSE-PolyHaven.txt`
- `public/assets/environment/aegis-city-kit.glb`
- `public/assets/environment/aegis-landmarks.glb`
- `public/assets/environment/aegis-skyline-lod.glb`
- `public/assets/environment/asphalt-diff.webp`
- `public/assets/environment/asphalt-normal.webp`
- `public/assets/environment/asphalt-rough.webp`
- `public/assets/environment/atlas-color.webp`
- `public/assets/environment/atlas-manifest.json`
- `public/assets/environment/atlas-normal.webp`
- `public/assets/environment/atlas-orm.webp`
- `public/assets/environment/authored-manifest.json`
- `public/assets/environment/external-manifest.json`
- `scripts/acquire-environment.mjs`
- `scripts/environment-baseline.mjs`
- `scripts/environment-capture.mjs`
- `scripts/environment-performance.mjs`
- `scripts/environment-report.mjs`
- `scripts/environment-slice.mjs`
- `scripts/integration-browser.mjs`
- `scripts/integration-capture.mjs`
- `scripts/integration-performance.mjs`
- `scripts/prepare-environment-materials.mjs`
- `scripts/validate-environment-assets.mjs`
- `src/vite-env.d.ts`
- `src/world/CityLayout.ts`
- `src/world/DeploymentBay.ts`
- `src/world/WorldCollision.ts`
- `src/world/WorldRecovery.ts`
- `src/world/WorldStreaming.ts`
- `src/world/environment/AssetLibrary.ts`
- `src/world/environment/Atmosphere.ts`
- `src/world/environment/CityInfrastructure.ts`
- `src/world/environment/EnvironmentAudio.ts`
- `src/world/environment/EnvironmentDebug.ts`
- `src/world/environment/EnvironmentMaterials.ts`
- `src/world/environment/GpuProfiler.ts`
- `src/world/environment/Precipitation.ts`
- `src/world/environment/UrbanAmbience.ts`
- `src/world/environment/WeatherState.ts`
- `tests/environment.browser.spec.mjs`
- `tests/environment.test.ts`
- `tests/integration.browser.spec.mjs`
- `tests/world-recovery.test.ts`
