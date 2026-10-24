# AEGIS Phase 9 — stationary barrage, demolition and living blocks

## Finalization status

The user explicitly asked to skip the remaining performance matrix/live verification and finalize. No further game launch is authorized by this checkpoint. Code validation completed: **62/62 offline tests pass, production build passes, asset/preservation audit passes**. Results: `artifacts/phase9/final-code-checks.json`.

Earlier real-input captures verified ground, hover, exposed-roof, glass and Gothic Y openings, enabled-capsule normal transit, two-salvo O/F tower collapse, and persistent ruins/props. The final launcher concurrency change is covered by an offline test that flies four ordinary missiles alongside all eight barrage rounds without retargeting prior missiles, consuming primary ammo for Y, or exceeding the pool.

Remaining live work is explicitly deferred: full browser regression, bundled production browser smoke, the LOW/MEDIUM/HIGH/ULTRA performance matrix, and the corrected simultaneous-collapse/barrage stress fixture. The last stress attempt exposed an input-order race in the test: it switched targets before the requested F input had actually launched. The script now waits for an actual launch counter increase and game cooldown. This fixture correction has not been rerun live.

The user chose to retain the Android emulator. Existing late MEDIUM measurements share the GTX 750 Ti with roughly 1.3 GB of emulator VRAM: barrage 32.2 FPS mean / 97.3 ms worst; demolition 45.2 FPS / 152.8 ms worst. These are weapon diagnostics, not a four-tier gameplay matrix or a controlled improvement comparison. The source-fragment bounds fix removed the large measured CPU rendering scan, but an overall sub-100-ms frame guarantee is not established under GPU contention.


This supersedes Phase 8's auto-traversal Y behavior. The original Phase 8 report and captures remain historical evidence. Phase 9's audit and design decisions are in [PHASE9-PLAN.md](PHASE9-PLAN.md); final live results, exact before/after photographs, recordings and raw measurements are in [the Phase 9 review](../artifacts/phase9/review.html) and [verification.json](../artifacts/phase9/verification.json).

## Preservation and scope

The baseline is the 223-file working snapshot in `artifacts/phase9/before/snapshot.json`, including existing user edits, rather than Git HEAD. Twelve protected player, rig, HUD, input, camera, audio and physics sources and fifteen original supplied assets are hash-checked by `scripts/phase9-offline-audit.mjs`. See `artifacts/phase9/preservation.json` for every baseline source change.

The main game retains its fixed 2048 m world, 971 placements, five districts and 25 authored architectural families. No professional intact building has been replaced by a generated box. No new third-party download or license change was made. The main rig and HUD source are preserved; the new barrage status/target marker is a separate lightweight DOM overlay.

## Y — Titan Breach Barrage

`src/world/titan/TitanBreakthrough.ts` is now a compatibility export for `TitanBreachBarrage.ts`. Keep the alias while older integration code imports it.

The ability accepts stationary ground, roof and hover starts. The actual camera ray selects architecture beyond the hero. `reserveBarrage()` loads source detail and checks the launch line, corridor, lower walking clearance and exit before committing resources. Reservation changes no source geometry. A successful reservation atomically locks the real launcher and spends 48 energy; the finite eight-round ability load is independent of the ordinary F magazine.

Acquisition lasts about .4 s and deployment .6 s. `Missiles` unfolds its original shoulder caps/pods, and `Encounter` uses the existing arm-aim API. Actual projectile waves contain 3, 3 and 2 rounds; each wave waits for the preceding impacts. Actual impacts progressively remove reserved original `_cid` triangles and matching collision. The ability never writes player velocity, relocates the player or disables the capsule.

`finishBarrage()` drains queued work and sweeps an expanded capsule through five lateral lanes at flight and walking heights. Only successful physical clearance produces **BREACH COMPLETE — PATH OPEN**. Loose fragments are physically ejected sideways for a bounded cleanup interval. A blocked route reports failure. The player then uses normal W/flight/brake controls.

Limits: range 180 m, depth 80 m, cooldown 16 s, eight finite rounds, 16 s attack timeout. Geometry, street fixtures, resources, transformation or ragdoll can reject/interrupt an attack. `entries`/`exits` legacy diagnostic counters now count verified openings, not automatic player transit. `completed` plus actual motion/capsule evidence establishes gameplay behavior. Diagnostic event and projectile histories are bounded. A barrage can begin with up to four ordinary missiles already airborne, leaving room for its three-round wave in the eight-projectile pool; pending ordinary launch queues still block it.

## O/F — structural demolition and persistent ruins

O toggles demolition; F fires three actual heavy missiles. Each costs 14 energy; heavy salvo cooldown is 4.5 s. Standard missiles retain their original ordinary magazine, targeting and enemy damage (38 direct). Heavy building multipliers are environment 8, structure 14 and radius 2.1. Only heavy charges transmit attenuated energy into the struck floor's existing load-bearing core/posts and the floor below; tower mass and distance reduce coupling.

`SupportGraph` gates partial versus critical lower-floor failure. Sector selection now uses the support layout's center, fixing imported assets with offset origins. A collapsed state cannot be downgraded by later queued hits. All authored families can fail after genuine critical support loss; only two moving source presentations run simultaneously and all component removal shares the existing scheduler budget.

`CollapsePresentation.ts` moves four bands of original UV/material-preserving source architecture under gravity/tilt, with coarse moving collision and individual ground-impact transitions. It does not scale the standing building down or sink it through the ground. The source HLOD disappears only after full structural failure. Authored glass/Gothic/industrial ruin LODs, bounded small source-facade patches and three persistent convex hulls occupy the destroyed footprint. Distant full-collapse proxies stay hidden; partial proxies keep full height.

This is an artistic grouped structural system. Falling bands use kinematic transforms rather than unconstrained physics on every component. Source patches are small bounded sections; selecting an entire floor produced unacceptable billboard-like ruins and was removed. Major ruin hulls approximate collision rather than tracking every visible triangle. Explicit subset bounds prevent Three.js from scanning shared whole-building buffers for each small patch. Full collapse drops obsolete standing-detail collision in favor of moving masses and ruin hulls, avoiding needless upper-floor collision construction. Small fragments use pooled capped bodies, sleep/static conversion and sparse serialization.

`ArchitectureDestruction.serialize()` retains version 2 and accepts optional destroyed prop IDs through `City`. Ruins, corridors, source masks, thermal scars and props reconstruct after snapshot restore and distance streaming. There are no simulated bodies for every intact facade.

## Authored environment and effects

Editable source: `art/environment/phase9/demolition-and-living-block.blend`; authoring script: `build_phase9.py` in the same directory. Runtime source/raw export and optimized Meshopt GLB live under `public/assets/environment/metropolis/phase9-demolition-kit*`. There are 19 original modules: nine material-specific ruin LODs, three fracture linings, a continuous chipped passage slab, storefront, fire escape, service bank, railing, lofted sedan and courtyard span.

The optimizer must use `prune({keepAttributes:true})`: GLB materials acquire shared PBR textures at runtime, so apparently unused UVs are required. The audit checks finite positions/normals/UVs, indices, LOD keys and all asset hashes.

`LivingBlock.ts` composes frontages from saved building sockets, eight fictional signs in one atlas, services and fences, fire escapes, constrained curb parking and courtyard connections. Close detail is instanced and distance-limited. Source-attached modules hide after full collapse; broken prop IDs persist. No road, world-scale or source-family scatter regeneration occurs.

`ArchitectureImpactEffects.ts` adds evolving pooled density smoke and turbulent plume flames. It is GPU shader illusion, not fluid simulation. Existing quality, effect, debris and work caps remain. `config.ts` prefers MEDIUM on ordinary hardware; saved user choices remain authoritative.

## Reproduce verification

Use `npm.cmd` on this Windows setup. Start the main game with:

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5192
```

Open `http://127.0.0.1:5192/` for normal play. E flight, Space climb, Q brake, Y barrage, O demolition toggle, F missiles, L laser. For a straightforward ground breach, face Prism Exchange's clear facade with at least 48 energy. QA URLs are only for reproducible fixtures and recording automation.

```powershell
node --import tsx --test tests/physics.test.ts tests/environment.test.ts tests/world-recovery.test.ts tests/world-realism.test.ts tests/visibility-destruction.test.ts tests/phase8.test.ts tests/phase9.test.ts
npm.cmd run build
node scripts/phase9-offline-audit.mjs
node node_modules/@playwright/test/cli.js test --config playwright.phase9.config.mjs
node scripts/phase9-live-acceptance.mjs
node scripts/phase9-destruction-performance.mjs
node scripts/phase9-report.mjs
```

Run GPU workloads serially. Never edit imported runtime files during capture, because Vite HMR reloads the game. Do not run Blender/build/unit workloads during FPS timing. Acceptance video includes QA starting fixtures, then genuine keyboard inputs and uninterrupted physics; performance runs contain no video. `scripts/phase9-before-streets.mjs` is restricted to paired architecture photographs. Legacy scripted collapse fixtures remain regression tests, not Phase 9 weapon acceptance evidence.

## Remaining art and performance boundaries

Do not describe this city as fully premium or visually finished. The main gameplay change and structural pipeline are implemented, but broad avenues, repeating source families, simplified cars/crowds, generic breach linings and some exposed interior surfaces still need further art direction. Wet reflections are inexpensive approximations. Ruin shapes are grouped approximations with three major collision hulls. HIGH/ULTRA are measured separately and are not promised to reach 60 FPS on a GTX 750 Ti. Use the final report's measured tail latency and stress limits rather than average FPS alone.

Earlier failed recordings and assertions are retained under `artifacts/phase9/acceptance*`. Two roof fixtures were obstructed by their own building/adjacent exit. A later exposed-edge fixture verified roof activation. Unit tests also caught the support-sector center bug and the GLB audit caught stripped UVs. Preserve those histories when extending the system.
