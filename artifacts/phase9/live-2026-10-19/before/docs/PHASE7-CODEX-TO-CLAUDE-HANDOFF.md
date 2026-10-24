# Phase 7: supplied architecture and persistent destruction in MAIN

Main project: `C:/Users/XD GAMING/Downloads/Work/Agesis Game`. Branch and existing unfinished character/HUD work remain uncommitted. No reset, stash, worktree deletion or cherry-pick was performed.

**Verification resumed on 12 October 2026:** the user made the GPU available and requested all deferred checks. Fresh matched screenshots, recordings and 35 performance scenarios now use the current code and repaired LODs. Final validation is recorded in `artifacts/phase7/verification-summary.json`. This validates the implementation and measurements; it is not a claim of final art completion.

## Result and scope

The default 2048 × 2048 world uses **571 saved placements drawn from 38 of the 45 prepared source families**. This includes the sixteen deployment district lots and two landmarks. Positions, orientations, dimensions and families are in `art/environment/phase7/city-layout.json`, compiled into `src/world/FixedCityLayout.ts`. Runtime no longer generates the primary city architecture from random primitive dimensions.

The full London glass tower and a complete Aria Gothic tower were implemented and demonstrated first. Their original silhouettes, UVs and materials are retained. The later city rollout uses complete supplied Downtown, Industrial, Gothic, Citadel and Singapore models. Geometry is cut into local damage sections in Blender; cuts interpolate original UVs. Hidden structural additions follow the source floor outline rather than projecting rectangular slabs beyond curved facades.

## Editable sources and exports

- Supplied originals: `art/external/` (all fifteen files checksum backed up and kept unchanged).
- Complete metric source Blender copies: `art/environment/phase7/provided/*-source.blend` and `art/environment/phase7/city/*-source.blend`.
- Editable damage/LOD Blender files: the same directories, `*-destructible.blend`. `_CID` point attributes identify independent sections, and the catalog identifies glass, wall, roof, slab, decoration and support roles.
- Runtime GLBs: `public/assets/environment/premium/provided/*-optimized.glb` and `public/assets/environment/premium/city/*-optimized.glb`.
- Prepared fractured glass/wall/partial-collapse GLBs: `art/environment/phase7/provided/fractured/`, with a manifest of removed sections and triangles.
- Shared authored debris: `public/assets/environment/premium/destructible/fractures-optimized.glb`.

The earlier generated architecture experiment in `art/environment/phase7/premium_build.py` is not the primary city library. Its exports and development captures are retained as an identifiable iteration, not visual completion evidence.

## Provenance and licenses

`artifacts/phase7/provided-asset-inventory.json` records all supplied files, SHA-256 hashes, embedded creator/source/license metadata and ZIP license text. `public/assets/environment/ATTRIBUTION.txt` ships the credits, source links, license links and modification notice.

Active complete source packs:

| Source | Creator | License recorded in supplied file |
|---|---|---|
| London skyscraper and Singapore office | 99.Miles | CC BY 4.0 |
| Gothic Building for Aria 1.0 | ChamberSu1996 | CC BY 4.0 |
| Downtown and Industrial building sets | Daniel Zhabotinsky | CC BY 4.0 |
| Art Deco Citadel | Samuel Francis Johnson / Oneironauticus | CC BY 4.0 |

Other supplied packs were inspected and inventoried. The Modern City Block records Sketchfab Standard, rather than CC0. Downtown MegaKit Standard contains an explicit Quaternius CC0 license. These should not be described as sharing one blanket license. Source-page access returned 403 during live verification; the actual downloaded GLBs contain their provenance and license notices.

Additional downloaded CC0 Poly Haven facade modules, air conditioning, fire escape and bracket lamp are preserved in `art/environment/phase7/external/`. Verified file URLs, creators, download timestamps and checksums are in its `provenance.json`; editable conversions are in `aegis-licensed-modules.blend`. Six CC0 PBR texture sets have their own provenance in `art/environment/phase7/materials/`.

## District diversity

`artifacts/phase7/diversity-audit.json` records actual family frequency, source file, geometry hash, material palette and dimensions for each district. Current layout:

| District | Placements | Distinct source families used |
|---|---:|---:|
| Financial | 161 | 11 |
| Gothic | 159 | 8 |
| Industrial | 17 | 11 |
| Commercial | 109 | 6 |
| Residential | 125 | 6 |

Wide complete blocks use paired parcels. The skyline now combines curved glass, ornate spires, Art Deco and varied mid-rise roofs. The former green polygon hills were removed; distant source architecture supplies the horizon. Roads, harbor bridge, reserved deployment court, weather and recovery boundaries remain integrated.

## Destruction and collision

`ArchitectureDestruction.ts` owns sparse damage records for all 571 registered source buildings. Intact buildings render through shared instancing. On damage, a few combined material meshes use precomputed `_CID` index ranges to remove actual geometry. First-hit reconstruction of thousands of meshes was eliminated.

Undamaged floors retain resident simplified collision. Affected floors activate surviving source triangles and interior sections; removed sections lose their collision. Four broken base supports justify complete collapse; lesser support losses remove the affected upper sector progressively. Debris is capped at 24 dynamic pieces on LOW, 32 on MEDIUM and 48 on HIGH. Fragments settle/sleep and become fixed collision; their visual pool is bounded. Destroyed building records survive tile unloading, and intact far instances cannot be restored over destroyed buildings. Restart restores the world.

`EnvironmentalDestruction.ts` adds persistent damage to lamps, benches, trees, cars, containers, cranes and local air conditioning/lamp props. Shipping containers own individual collision; crane destruction removes its owned infrastructure supports. Existing checkpoint destruction remains the original gameplay system.

Resident building collision contours are derived from actual intact exterior vertices in four-metre bands. This preserves curved contact normals instead of replacing the London tower with a rectangular invisible wall. Activated detailed collision uses the original source triangles.

## Rendering and optimization

Near retains UV-preserving source detail. Medium/far reductions are made from **complete source meshes before damage segmentation**. Reducing disconnected cut triangles caused holes, and generic closed silhouette proxies distorted UVs; both approaches were rejected. `source_lods.py` retains planar skins and glass while reducing closed ornamental geometry. LOD submeshes are combined by material after normalized attributes are reconciled.

The verification pass corrected two more issues: capture views were applied after instance culling, omitting architecture in some fixed-camera images; and collapse decimation could erase authored pillar/support geometry. Capture cameras are now applied before culling, with a regression test that checks a visible landmark and its removal when looking away. Source pillar/barrier meshes keep their authored geometry after planar simplification, small meshes skip collapse decimation, and original object names remain stable between LOD passes. Eighteen affected glass/Gothic medium/far exports were rebuilt and all 135 runtime GLBs decoded successfully. Near damage meshes, source originals and collision templates were preserved.

Native BC3/DXT5 mipmapped textures are used when S3TC is supported; equal-resolution WebP fallback is available. Source textures remain preserved in the editable/full-original files. Runtime PBR copies use 1K maps, shared by material name across LODs. Texture sharing also preserves UV transforms, wrapping, color space and UV channel. Geometry uses Meshopt compression. This target uses native S3TC rather than a KTX2/Basis transcode pipeline. LOW's existing 0.85 pixel ratio and HIGH's 1.25 ratio were retained and recorded.

Byte-identical DDS/WebP pairs now share 101 source-map URLs. 190 redundant generated maps were checksum-verified and archived. Unused generated experiments, raw GLBs and logs were also archived in `art/environment/phase7/runtime-source/`. The premium runtime folder fell from 1,292,258,203 to 304,560,764 bytes. These are disk/package sizes, not total VRAM. `runtime-packaging.json` and `texture-sharing.json` record the moves. The original supplied GLBs and all editable Blender sources remain intact.

Far and nearby source instances are compacted to the actual camera frustum. Nearby shadowed presets retain a 24-metre margin for shadow casters. This removes submissions for buildings behind the camera without changing their models or render resolution. Near tile counts remain bounded and distant collision never waits for visual streaming. Only near meshes cast city shadows. Point lights have a fixed local budget; wet-ground light proxies are inexpensive approximations rather than full screen-space reflections.

## Evidence

- Original fixed-camera baseline: `artifacts/phase7/before/` (ten poses, camera manifest and benchmark).
- Current supplied-model city captures: `artifacts/phase7/final/` (ten matched camera poses). Both comparison sets hide only the hero root to avoid a fixed camera overlapping the character; gameplay footage shows the hero normally.
- Current source building intact/window/wall/structural/collapse screenshots and videos: `artifacts/phase7/final-showcase/`.
- Actual hand-beam and missile input footage and measurements: `final-showcase/actions.json`, `*-weapons-damage.png`, and its videos.
- Six actual main-game walk/flight/traversal/combat/quality recordings: `artifacts/phase7/world-videos/`.
- Complete current source-building 20-scene benchmark: `final-showcase/performance.json`. Earlier scoped and interrupted measurements remain archived and are not the final performance result.
- Matched whole-world before/after: `baseline-isolated/combined-performance.json`, `final/combined-performance.json`. Both use a fresh Chrome process and 180 warmup frames before 360 timed frames per scene. The original runtime was copied from the verified backup into `baseline-runtime/`; MAIN was never replaced to run it. Its Vite dependency cache is separate to avoid corrupting MAIN's module cache. Initial historical and contended runs are retained, including `pre-verification-20261012/`.
- Review gallery: `artifacts/phase7/review.html`; artifact index: `final-evidence-index.json`.

QA supplies initial poses and controlled damage stages. Weapon footage uses existing keyboard combat inputs. Videos and screenshots are actual WebGL captures, not AI concept images. Recording itself adds overhead, so benchmarks are recorded separately with 360 active frames and GPU timer samples.

## Performance evidence and limits

Detected renderer: NVIDIA GeForce GTX 750 Ti via ANGLE/D3D11, Chrome 155.0.8059.40, 1280 × 720 viewport. LOW's internal resolution remains 1088 × 612 and HIGH's remains 1600 × 900. Every whole-world scene contains 360 active gameplay samples. The source city is materially heavier than the original kit:

| Scene | Before mean ms | After mean ms | After FPS | After p95 ms |
|---|---:|---:|---:|---:|
| LOW day street | 6.94 | 16.34 | 61.2 | 20.9 |
| LOW rainy street | 6.94 | 16.61 | 60.2 | 20.9 |
| LOW night street | 6.94 | 16.03 | 62.4 | 20.9 |
| LOW three-enemy combat | 8.01 | 22.05 | 45.4 | 27.8 |
| LOW rooftop landing | 7.06 | 20.97 | 47.7 | 20.9 |
| LOW restart gameplay | 7.62 | 23.75 | 42.1 | 27.8 |
| MEDIUM walking | 8.30 | 21.97 | 45.5 | 27.8 |
| HIGH day street | 11.88 | 25.95 | 38.5 | 27.9 |
| HIGH night rain | 12.02 | 28.82 | 34.7 | 34.7 |

LOW flight/high-altitude scenes averaged 6.96 ms. Current showcase damage scenarios averaged about 52–63 FPS on LOW and 30–36 FPS on HIGH. These are measured scenario averages, not guarantees of a minimum frame rate. LOW is the practical preset on this GPU; stable 60 FPS across combat and restart is not achieved.

The earlier Android emulator contention is preserved in `gpu-contention.json`. In the resumed runs the emulator was closed. Each benchmark scene records NVIDIA machine totals and Windows WDDM memory counters after the timed sample. Whole-world machine usage ranged from 1,287 to 1,484 MiB of the 2,048 MiB adapter; ordinary desktop applications remain included. Browser-specific dedicated/shared allocations are in each scene's `hardware.benchmarkBrowserMemory`. These are sampled allocations, not peak readings or a sealed laboratory benchmark.

Memory figures are estimates from geometry, instance buffers and texture mip data. They are not authoritative total VRAM readings. Asset loading, shader startup and steady gameplay are distinct costs. The loader now waits for initial tile assets and shader compilation before exposing the QA/game-ready hook.

## Preservation and validation

Verified recoverable backup: `C:/Users/XD GAMING/Downloads/Work/Aegis-Art-Backups/20261011-170704`. It includes original working-state files and Git metadata. `provided-assets/` adds a verified backup of the fifteen user-supplied files (794,388,300 bytes). The final preservation report is `artifacts/phase7/preservation/audit.json`.

Character, pilot, armor, camera, HUD, input, animation, weapons and mission implementation files were not rewritten. Main bootstrap changes connect the new world destruction observer, wait for initial GPU readiness and append architecture attribution to the existing Credits dialog without changing `Hud.ts`. `Destruction.ts` adds two world observers; existing breakable checkpoint behavior remains unchanged. Environment and integration tests now derive collision expectations from the actual supplied models and verify sustained weapons can open holes. Crane restart restores both source instance matrices and support collision. Deferred damage loads are invalidated by restart/disposal.

Six physics and eleven environment/recovery unit checks pass. The final 30-case browser run passed 29 checks; its hard-lock test used a 3.6-second wall-clock wait for a three-second simulation-time grace period. After changing only that test to confirm real occlusion and wait for lock release, its focused rerun passed. `browser-results.json` is explicitly labeled as the latest results across those two runs; the initial report and rerun remain separately available. Targeting/character code was preserved. All 30 latest check outcomes pass, without retrying unrelated checks to conceal that initial failure.

The built production game at the ordinary URL also passes six real-input checks: bootstrap without mutable QA hooks, attribution, deployment, walking, takeoff/flight, and pause/resume (`production-smoke.json`). The final build passes and retains the large-bundle advisory for Three and Rapier. Original Claude regression artifacts are restored after generated results are copied to `preservation/regression-output/`. The final preservation audit verifies 1,087 original files unchanged, fifteen authorized world/integration file changes, zero unexpected changes and all supplied originals unchanged.

Behavior tests now run on the target LOW preset, while separate matched benchmarks cover LOW, MEDIUM and HIGH at their original resolutions. Sequence assertions wait for actual deployment/finisher states. Flight crash setup uses the integrated relocation helper, and aerial melee uses two airborne combatants so floor impact does not preempt fist contact. The original ground-diving air-strike setup can crash before contact; character/combat code was deliberately preserved and that case is not claimed fixed.

## Remaining visual and simulation limits

This is a source-asset art rebuild and playable destruction foundation, not photorealistic or AAA-equivalent production art. Street dressing and coastline composition remain simpler than the supplied hero buildings. Some Gothic kit arrangements are open frames or detached ornaments and still need a deliberate architectural assembly pass; passing functional checks is not visual sign-off for those blocks. Some ordinary source packs have baked low-poly facade textures. Far reductions sacrifice small ornaments. Wet reflection proxies approximate local light, and interior rooms are simplified. Collapse is a controlled structural sector/floor cascade with bounded debris, not an engineering-grade stress simulation. The assembly bay and road infrastructure remain gameplay fixtures alongside destructible city buildings. Do not describe unimplemented fixture destruction as complete.

## Continue safely

Start with the current files, not the old environment worktree bootstrap. `src/player/`, `src/combat/`, `src/ui/`, hero/pilot assets and all existing animation work remain Claude-owned. Review world and integration hunks separately before committing. Run `npx.cmd playwright test --config playwright.phase7.config.mjs` for the full current game. Keep asset attributions with any redistribution and do not replace the source near models with randomized primitive towers.

For source re-exports use `prepare_provided.py`, `prepare_city.py`, then `source_lods.py` for each namespace before Meshopt optimization and source texture preparation. Reapply exterior collision contours and texture deduplication after exports. The saved city JSON is authoritative: the older layout/prototype installer experiments do not include the final sixteen deployment lots, contour corrections and full source catalog, and must not be rerun over the final layout. Archived raw GLBs remain available to the texture and collision preparation scripts.
