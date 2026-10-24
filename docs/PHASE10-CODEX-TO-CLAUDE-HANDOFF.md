# Phase 10 — cinematic Titan Breach and browser presentation

<!-- LIVE RESULTS -->
Final verification passed (2026-10-19T04:25:11.582Z). 85 offline tests, 56 browser passes with 0 failures, eight fresh real-input Y recordings, real O/F collapse footage, production LOW/MEDIUM/HIGH/ULTRA, matched six-view comparisons and serialized profiling are recorded in [the review](../artifacts/phase10/review.html) and [verification.json](../artifacts/phase10/verification.json).

Shared-GPU rainy-night Y: LOW 121.3 FPS / p99 14.0 ms / worst 41.7 ms; MEDIUM 76.7 FPS / p99 27.8 ms / worst 48.6 ms; HIGH 60.1 FPS / p99 34.7 ms / worst 48.7 ms; ULTRA 59.5 FPS / p99 34.8 ms / worst 62.4 ms. MEDIUM internal dimensions: 1280 × 720. These are short local measurements with other applications left running, not minimum-FPS or zero-stutter guarantees. Read the full cold-streaming/stress tails and point-in-time hardware allocations.
<!-- /LIVE RESULTS -->

## Scope and preservation

This continues the main game. The baseline is the user's working tree, including all uncommitted changes, captured in `artifacts/phase10/before/` (251 files). No commit, push, deployment or publication has been performed. The Phase 7, 8 and 9 handoffs, source architecture, source licenses, browser evidence and performance reports informed this implementation. The verbatim request is `artifacts/phase10/request.txt`; the implementation audit and plan are [PHASE10-PLAN.md](PHASE10-PLAN.md).

The fixed 2048 m world, 971 saved placements, five districts and 25 source families remain. Complete supplied building models remain the intact architecture. This phase does not replace source buildings with generated boxes or regenerate the master layout. `artifacts/phase10/preservation.json` records exact changed/new source files, twelve protected source hashes and all fifteen original supplied asset hashes. Character, pilot, rig, base animations, PlayerController, Hud, CameraRig, AudioSystem, InputController and PhysicsWorld sources are preserved.

## Y cinematic controller

`src/world/titan/TitanCinematicAssault.ts` is the active controller. The main game still imports the compatibility name `TitanBreakthrough`, whose export now resolves to this new class. `TitanBreachBarrage.ts` remains the historical stationary implementation and is not wired into the main game. Old Phase 9 stationary behavior tests/capture scripts are historical; the Phase 10 browser suite supersedes those two stationary acceptance assertions.

States: IDLE → PREPARING → ACQUIRING → DEPLOYING → BARRAGE → ENTRY_CONFIRMED → ACCELERATING → INTERIOR_TRAVERSAL → EXIT_IMPACT → RECOVERY → COMPLETE. Failure/interruption enters ABORTED. The BARRAGE state carries three 3/3/2 projectile waves, each gated by real impacts and launcher availability. Repeated Y does not duplicate the reservation, cost or launches.

Preflight requires armor, health, ready launchers, 48 energy, the 16 s cooldown, a real target, range/depth limits, source asset readiness, the prepared interior kit, a reservable corridor, clear exterior approach and a 14 m safe exit runway within the world boundary. The planner checks the full saved layout. Reservation changes no source geometry or collision. Late preparation is invalidated by epochs and releases its reservation without spending energy.

The entrance's final three metres include destructible canopies/stoops. They are checked with the corridor; they are not ignored by movement. The first live rejection identified a real canopy rather than disabling its collision. Actual hits remove reserved original component triangles and matching collision. Only after all eight impacts, scheduler completion, debris ejection and capsule clearance does automatic movement begin. Cinematic clearance checks the centre and ?.35 m lanes with a .40 m capsule radius, proving a 1.5 m wide envelope. The legacy five-lane manual-traversal guard remains the default. This prevents unused outer-lane debris from vetoing a clear cinematic trajectory; all debris collision and per-step motion sweeps remain enabled. A source-based regression separately verifies that a central fragment still blocks entry.

`CinematicRoute.ts` sweeps the real .68/.37 m capsule before each move. `CharacterBody.move` remains enabled and resolves every step; no ability teleport, setEnabled(false), noclip or artificial completed traversal exists. Flight moves continuously to the entry, through the corridor, out through the far facade and into a short decelerating recovery. The route is not silently cleared if a new obstruction appears. Failure stops safely and restores ownership without granting completion. The passage remains in persistent destruction snapshots.

The ability owns movement and weapon input temporarily. `main.ts` skips normal player.control while the controller owns movement, rather than calling its disabled branch that zeros velocity. Encounter continues simulation, targeting, enemies, missiles and VFX, while its new allowPlayerInput flag suppresses ordinary attacks. Input is cleared at commitment/recovery. Pause, blur, hidden document, death, reset, lost reservation and encounter cinematics release ownership. Energy/cooldown persist after a committed attack.

## Camera, animation and audio

`CinematicCamera.ts` is an additive director around the unchanged CameraRig. It uses a constrained shoulder view, close interior chase, an exterior side reveal that frames the hero and damaged facade, and recovery toward ordinary flight. Translation compensation prevents the high-speed camera from lagging far behind the hero. Every interpolated boom is sphere-swept against fixed world collision. FOV and orientation blend smoothly; the quaternion interpolation uses a separate target quaternion to avoid aliasing the output. A projection/orientation regression covers the visual-review failure that originally kept looking forward during the exit orbit.

Reduced cinematic motion is available in the existing Settings dialog through a small additive listener in main; it also honors the OS reduced-motion preference. The original HUD implementation is unchanged. The ability uses a small separate status/target overlay.

`BreachAnimation.ts` creates three original additive quaternion clips in the existing character mixer: titan_acquire_brace (0.8 s), titan_flight_stabilize (1.1 s), titan_exit_recoil (0.65 s). Inspect/export them at `art/animation/phase10/titan-breach-clips.json` using `node --import tsx scripts/phase10-export-poses.mjs`. Existing base flight/ground motion, rig/skin, shoulder deployment mechanism and thruster attachments are retained. No original skeleton or character asset is modified. Chest/helmet energy is raised subtly during the sequence and restored afterward. Existing synthesized audio cues carry actual contact distance/stereo placement for missile/interior impacts. Raw Playwright videos are silent and do not establish audible mix quality.

## Source architecture, prepared interiors and VFX

Editable Blender source: `art/environment/phase10/cinematic-corridors.blend`. The four asset-browser collections contain office partitions, damaged stone vaulting, industrial pipes/service frames, and detailed entrance canopies. The file opens on the office; alternate prototypes are hidden in the viewport for inspection. Reproduction script: `art/environment/phase10/build_cinematic_kit.py`; README alongside it.

Exports: `public/assets/environment/metropolis/phase10-cinematic-kit.glb` and `phase10-cinematic-kit-optimized.glb`. The optimizer retains UVs/normals and Meshopt compression. The complete kit has 8,684 triangles and thirteen material primitives; its compressed byte count and all validation results are recorded in asset-kit.json/preservation.json. Existing shared PBR textures are reused. No new third-party downloads or unique per-building 4K maps were added.

`BreachInteriors.ts` selects the authored office, stone or utility detail from the building's material family, instancing it only along nearby damaged corridors. Existing fractured linings/floors, original surrounding architecture and physical passage floors remain. This is a bounded prepared interior system, not fully furnished every-floor building interiors.

Missile impacts still hit real collision surfaces. Interior markers add spatial dust/sparks alongside the route. Actual arrival at the far opening triggers a larger directional blast: layered noisy fireball lobes, pressure fronts, material dust, sparks, fragments, source debris and thrusters. Existing global quality/pool caps remain. Ordinary thermal laser damage and O/F support-driven full collapse are preserved, including moving source bands, settled source-derived ruins, sleeping debris and streaming/save persistence.

## Material and street presentation

Shared shaders improve metre-scale normal/roughness response, porous AO/dirt, varied puddle roughness, sidewalk joint relief, subtle rain ripple and selected parallax window occupancy. Existing BC3/DDS mip chains with WebP fallbacks remain. Rain reflections are bounded source-facade proxies and actual local light response, without adding a whole-screen reflection pass to MEDIUM/LOW. Day/overcast/night light balance is adjusted and the existing fixed local light budget prioritizes nearby real anchors.

The Gothic material audit found source transmission .792 with transparent double-sided glass. It forced a second full-city render and a second linear shader family, causing multi-second cold rendering work and an approximately 826 ms in-attack diagnostic stall. `SourceMaterialPolicy.ts` converts architectural transmission to opaque reflective Standard glazing while preserving source color/maps/geometry. This affects runtime architecture only, not source files or the character. It changes refraction appearance deliberately for the browser budget. `AssetLibrary.ts` also prepares back/front transparent-side programs independently before publication. A fresh diagnostic run reduced the Gothic attack's worst frame to 34.7 ms; final acceptance/performance runs are reported separately.

New authored entrance canopies replace repetitive supplemental frontage modules at existing saved building sockets, with existing signs, curbs, slab paving, ramps, drains, signals, service access, fences, parked vehicles and ambient population retained. Canopies participate in the existing destructible prop registry. The city's source height/placement families and road/collision plan are unchanged.

Licenses: London glass by 99.Miles and Aria Gothic by ChamberSu1996 retain CC BY 4.0 attribution; the Meridian family retains the Quaternius CC0 source. See `public/assets/environment/ATTRIBUTION.txt`, `metropolis/LICENSES.txt`, the original inventory and `metropolis/PHASE10-LICENSES.txt`. Original supplied files remain hash-identical. Other supplied but unused/restricted assets are not silently added. Existing pilot/source licensing limitations remain relevant before redistribution.

## Reproduce

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5192
npm.cmd run test:phase10
npm.cmd run build
npm.cmd run audit:phase10
npm.cmd run test:phase10:browser
npm.cmd run capture:phase10
node scripts/phase10-final-verification.mjs
npm.cmd run review:phase10
```

The full verification orchestrator runs GPU tasks serially: offline checks/build/audit, browser regressions, production four-tier smoke, actual O/F collapse footage, matched street captures, four-tier unrecorded Y profiling, MEDIUM streaming/combat, then actual O/F plus simultaneous collapse/Y. Existing Vite preview must serve dist on 5194 for the production stage. Use ordinary http://127.0.0.1:5192/ for normal play; mutation hooks exist only with ?qa. QA changes initial fixtures/cameras/weather and preloads assets; actual keyboard inputs drive attacks and continuous traversal. Post-sequence persistence tests explicitly label their separate QA relocation phase.

E flight, Space climb, Q brake, Y cinematic, O demolition mode, F missiles, L laser. A straightforward nearby ground attack faces Prism Exchange, approximately x172/z-112. Invalid routes produce a reason instead of spending energy or forcing passage. Saved user quality choices remain authoritative.

## Limits and retained failure evidence

This is an authored browser cinematic and material refinement, not an AAA-equivalent finished city. Broad roads, repeated architectural source families, simplified traffic/crowds, prepared corridor repetition and some exposed component boundaries remain visible. Source-component damage is not arbitrary continuous mesh cutting. Full collapse remains grouped artistic source masses and coarse ruin hulls, not an engineering stress solver. Dust/fire/reflections are shader approximations.

Nearby attacks take roughly 7–9 s in current footage; a long rooftop approach can take around 14 s. Thus the initial 5–7 s creative target is not achieved for every range/building. Exit starts fast and decelerates within the safe runway before normal flight; reduced motion uses a restrained chase rather than the full side reveal. Pausing/focus loss aborts instead of resuming a half-finished scripted flight. Remaining cold-streaming/activation outliers and shared-GPU contention must be reported rather than claiming zero stutter or guaranteed 60 FPS.

Earlier raw functional captures, rejected exit framing and diagnostic shader traces remain under first-route, second-route, polish-review, gothic-shader-probe, gothic-reflection-fix, acceptance-pre-camera-polish, acceptance-follow-camera and exit-review. VISUAL-REJECTION.txt explains the rejected exit. Only the final acceptance directory and final unrecorded performance directories establish the latest delivered behavior. Before/after architecture photos use identical fixed cameras and lighting presets, but baseline hardware contention differs from later shared-GPU runs; they are not a controlled percentage-speed comparison.

Final stress verification: the old near-corner overlap fixture clipped a neighbouring saved footprint and correctly rejected Y before cost. Centre aim passed with actual simultaneous collapse, breach impacts and enabled-capsule traversal, without relocation or resource injection. Original failure: `artifacts/phase10/weapons-rejected-corner-aim/`; corrected run: `weapons-overlap-centre/`. The final combined result retains both attempt links.

The final report media check passed: 263 local links, 75 decoded images and nine 1280 ? 720 videos, including actual seek/playback. Architecture photographs hide the hero mesh; the raw industrial photograph retains a separate thruster bloom at its right edge. GPU samples list the benchmark browser, another Chrome instance, VS Code and desktop allocations. The emulator was left untouched; it is not listed in final allocation snapshots. Do not assert emulator VRAM usage from its earlier presence.
