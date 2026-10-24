> Phase 6.5: this file records the original isolated Phase 6 delivery/plan. The world has since been integrated into the dirty MAIN checkout with a verified backup and semantic bootstrap merge, as explicitly authorized by the user. Current results and continuation instructions are in [PHASE6-CODEX-TO-CLAUDE-HANDOFF.md](PHASE6-CODEX-TO-CLAUDE-HANDOFF.md). Do not apply the historical cherry-pick steps to the current dirty main tree.

# AEGIS Phase 6 environment delivery — 2026-10-11

Implemented in the isolated ../Agesis-Environment worktree, branch `feature/aegis-cinematic-open-world`, based on `784838c`. The original checkout and Claude's uncommitted character/HUD files have not been edited or merged. This is a runnable environment feature with actual GLB architecture and gameplay evidence. It is not a claim of final AAA art parity: archetype repetition, coarse vegetation and simple distant terrain remain visible.

## World and districts

The layout covers **2048 × 2048 m**, with 632 authored-asset building placements plus 16 preserved deployment-district buildings and two original landmarks. Dry island ground occupies 1904 × 2048 m; the eastern portion of the playable footprint includes water and a 448 m elevated bridge. Units are metres. There is no old 150 m ceiling or 300 m perimeter cage. Distant hills across water are scenery with no landing support; actual world collision covers the city/bridge footprint.

| District | Identity / approximate centre X,Z |
|---|---|
| Crown Exchange | Glass, faceted financial towers, art-deco setbacks, helipads; 130,-450 |
| Saint Vesper | Stone buttresses, pointed arches, spires, civic cathedral; -590,-450 |
| Ironwake Docks | Warehouses, cranes, containers, steel bridge and waterfront; 690,570 |
| Prism Mile | Commercial towers, shopfronts, original signs and neon panels; 160,370 |
| Meridian Gardens | Brick apartments, water tanks, park and trees; -600,480 |

The original spawn (0,.22,58), combat court (0,.05,-66), flight gates and destructible checkpoint remain. The landmark plazas, diagonal boulevard, irregular block intervals, curved waterfront and bridge approach are reserved in the deterministic layout, preventing roads from entering building footprints. District heights blend around a central skyline envelope. Skyline geometry stays visible above the active tile range and the camera far plane grows with altitude.

## Streaming, physics and quality

The world has **256 rendering tiles, 128 m per tile**. LOW/MEDIUM/HIGH/ULTRA cap detailed tiles at 9/16/22/28. Near geometry is built from cached Blender meshes through GPU instancing, one tile per frame, selected by player distance, camera heading and a 2.4 s velocity lookahead. Unloaded detailed geometry restores persistent authored distant meshes. Geometry/materials are shared; per-tile instance allocations are disposed on unload. QA teleports can explicitly prepare a target synchronously.

Simplified collision remains resident instead of following visual detail. 6770 fixed building/roof colliders, plus infrastructure and the preserved deployment region, are indexed by Rapier. This prevents asset/render streaming delays from creating collision holes. Faceted tower profiles use small convex hulls, ordinary envelopes and real-scale parapets use simple boxes, the cathedral roof uses a convex prism, and the bridge ramp uses one tiny triangle surface. Continuous capsule sweeps/CCD are the existing physics implementation. No hero or physics file was modified. Repeated traversal/disposal tests verify allocations remain bounded and actor/checkpoint bodies survive environment cleanup. Growing substantially beyond the tested 2 km footprint would require reassessing the resident collision budget.

All quality levels share the same layout, roads, landmarks and collision. Quality changes detail range, activity, particles and normal game rendering/shadows. LOW uses the existing .85 pixel-ratio cap; at a 1280 × 720 viewport its internal resolution is 1088 × 612. MEDIUM is 1280 × 720; HIGH uses the 1.25 cap, 1600 × 900, and the existing AO compositor. No expensive volumetric raymarching or city-wide screen-space reflection pass was added.

## Sky, weather and activity

The sky shader provides a solar gradient, sunset/sunrise warmth, sun disc/glow, moon, stars, light pollution and animated procedural cloud coverage. A separate translucent world-space cloud layer at 650 m can be approached and crossed in flight. Sun/moon lighting, fog colour, ambient/environment intensity and window/street/sign emission follow a configurable 20-minute day. Normal play advances the clock; QA freezes it for deterministic captures. Weather and hour are independent.

Ten presets are implemented: clear, partly cloudy, overcast, light rain, heavy rain, thunderstorm, dense fog, light snow, heavy snow, windy. Transitions interpolate cloud darkness, wind, visibility and precipitation. Local GPU rain streaks and snow flakes use world-anchored motion around the camera; solid shelter reduces particles. Rain darkens porous materials and lowers roughness by material family, with wet road/environment highlights, a localized inexpensive puddle/light reflection approximation and near-surface ripple sprites. Snow accumulates through upward-surface masks on roofs/ledges and park ground, plus snowfall haze. Fog thins with camera altitude. Storms use a reused lightning line and bounded directional illumination, delayed synthetic thunder, and reduced flashes by default.

Instanced ambient cars, street lamps, original signs/neon, roof machinery and industrial steam add activity. Environmental Web Audio uses a separate bounded synthesis graph unlocked by a gesture, with weather/wind/industrial distance influence and pause/audio-toggle handling. Cars/trees are lightweight decorative ambience; complex civilian AI and vehicle collision gameplay were not added.

Development controls are installed only in a development build with `?envDebug=1`: presets, clock/pause, precipitation intensity, quality, district teleports, reduced lightning, audio, tile/resource statistics. QA hooks retain the existing explicit `?qa=1` boundary. Tactical HUD files are untouched. Initial presets are also selectable through `?weather=heavy-rain&hour=22`.

## Blender and licensing

Editable source: `art/environment/aegis-environment.blend` (~2.97 MB), generated by `art/environment/build.py` using installed Blender 4.5.14. It opens on an asset gallery; origin-centred originals are organized in asset-marked Kit collections in LIBRARY_EXPORT. All 85 exported meshes have UVs/normals, proper material definitions and validated outward shell orientation. Facades/roofs use shared base-colour, normal and ORM atlases, with metre-scale shader projection in-game to avoid instance stretching.

| Export | Bytes | Meshes | Unique triangles |
|---|---:|---:|---:|
| public/assets/environment/aegis-city-kit.glb | 2,935,140 | 85 | 24,653 |
| public/assets/environment/aegis-skyline-lod.glb | 934,884 | 20 | 634 |
| public/assets/environment/aegis-landmarks.glb | 1,464,668 | 7 | 7,217 |

The full kit is the runtime cache; the skyline and landmark GLBs are focused additional exports. Near/far building variants, portals, roof ventilation/access, tanks, spires, metre-scale parapets, helipads, lamps, benches, storefronts, signs, containers, cranes, bridge trusses, cars and trees are original. Vesper Cathedral and Crown Exchange are original landmarks. No franchise model or downloaded third-party environment model was included. The only acquired assets are Asphalt 02's three maps by Rob Tuytel / Poly Haven, under [CC0](https://polyhaven.com/license), [source asset](https://polyhaven.com/a/asphalt_02), individually recorded with URLs, creator, original/optimized sizes, date, format, changes and commercial-use status in `public/assets/environment/external-manifest.json`. Original source and atlas provenance are separate manifests; texture license text is included. Shared runtime PBR texture storage is estimated at 8.39 MB, excluding character, sign canvases, shadows and render targets; browser APIs do not give authoritative total VRAM allocation.

## Actual validation evidence

- `artifacts/environment/vertical-slice/gothic-street.png`, `gothic-rooftop.png`, `gothic-altitude.png`: first-district real-browser validation.
- `artifacts/environment/scenes/01-...png` through `20-...png`: all twenty requested scenes, including district/weather, roof/altitude, wet road, boost flight, landing and LOW weather gameplay. Viewpoints, weather, hour, statistics and browser errors are in `capture-manifest.json`. Stills render the game world with QA camera composition and HUD/hero hidden; the gameplay recording retains the hero/HUD and actual keyboard movement.
- `artifacts/environment/videos/flight-districts-rooftop-weather.webm`: actual airborne flight recording, 187 km/h boost, Downtown-to-Prism traversal, braking and a 144 m rooftop landing. Final traversal reached X/Z 128.0,210.3. The committed hero is used because Claude's new character remains outside the branch.
- Browser captures recorded 0 errors. Visual review corrected inward-facing shells, misplaced roof rails, camera obstruction, excessive window emission, square snow masks, source UV collapse, floating offshore buildings/roads and sky/horizon cloud artifacts. Remaining art limitations are listed below.
- TypeScript check and production build passed (`build.log`); Vite retains the pre-existing large core/physics chunk advisory.
- **15 unit tests passed**: six existing physics tests and nine environment tests (`unit-tests.log`).
- **12 browser tests passed**, 0 failures, including six committed gameplay tests and six environment tests (`browser-results.json`).
- All three actual GLBs passed attribute/normal/orientation validation, and all external licenses were checked (`asset-validation.json`).

## Measured performance

Chrome 155.0.8059.40, headless, actual NVIDIA GTX 750 Ti / Direct3D11, 1280 × 720 viewport. Each measurement uses 360 warm frame samples; GPU times come from asynchronous EXT_disjoint_timer_query_webgl2 queries around actual render/compositor calls. The baseline clear LOW scene measured 6.94 ms mean and 7.00 ms P95 before the environment work (`baseline.json`). These are measured samples for these scenes, not guarantees for every future mission, display or merged character.

| Quality | Scene | Mean frame ms | P95 ms | Mean GPU ms | Mean physics ms | Draw calls | Triangles including passes |
|---|---|---:|---:|---:|---:|---:|---:|
| LOW | baseline-equivalent / clear | 7.00 | 7.10 | 6.42 | 0.248 | 150 | 179,414 |
| LOW | commercial-rain / heavy-rain | 6.94 | 7.00 | 5.88 | 0.241 | 203 | 203,471 |
| LOW | downtown-storm / thunderstorm | 6.94 | 7.10 | 6.08 | 0.244 | 145 | 150,266 |
| LOW | gothic-snow / heavy-snow | 6.94 | 7.10 | 5.17 | 0.227 | 176 | 378,093 |
| MEDIUM | commercial-rain / heavy-rain | 7.37 | 13.80 | 7.00 | 0.261 | 343 | 279,431 |
| HIGH | downtown-clear / clear | 11.69 | 14.00 | 11.11 | 0.430 | 802 | 512,129 |

The scene samples exceed the 30 FPS fallback target on LOW. The complete raw data, counts, asset sizes, measured tile creation times, GPU percentiles and physics timings are in `artifacts/environment/performance.json`. Repeated traversal checks bound tile count and keep geometry, texture and collision counts stable. Performance benchmarks are run separately from capture/test workloads.

## Scope and remaining integration work

Further hand-authored facade varieties, denser street storytelling, richer vegetation and more distinct bespoke neighbourhood shapes would improve visual variety. The current five building archetypes and low-detail outskirts remain recognizable. No building interiors, tunnels, mission expansion, pedestrians, complex traffic AI, persistent snow tracks or full urban reflection probes were added. Wet reflections and fog/clouds are deliberately inexpensive approximations. Cosmetic facade ornament does not receive individual collision; relevant roofs, bridge/deck/ramp and crane structures do. Distant terrain is not a landing destination.

The original deployment region retains its 16 prototype buildings for compatibility. New expanded city geometry is loaded from Blender GLBs. The upgraded hero/weapon/transformation/HUD changes still require the manual bootstrap integration described in `docs/ENVIRONMENT-INTEGRATION.md`; their uncommitted combined build has not been tested or merged. The complete created/modified file list, including generated files excluded from integration, is `artifacts/environment/file-manifest.json`.

Run the feature worktree with `npm.cmd run dev -- --host 127.0.0.1 --port 5186 --strictPort`, then open `http://127.0.0.1:5186/?envDebug=1`. Deploy, skip the intro, and use district controls. Regenerate evidence with `node scripts/environment-slice.mjs`, `npm.cmd run capture:environment`, `node scripts/environment-performance.mjs`, and `node scripts/environment-report.mjs` after the checks. Avoid concurrent GPU workloads while benchmarking.
