# AEGIS Phase 8 — implementation and live verification

> Phase 9 supersedes the Y gameplay and collapse presentation described here. See [PHASE9-CODEX-TO-CLAUDE-HANDOFF.md](PHASE9-CODEX-TO-CLAUDE-HANDOFF.md) and [Phase 9 evidence](../artifacts/phase9/review.html). Phase 8 measurements remain historical.

18 October 2026. The user explicitly authorized launching and verifying the MAIN game, superseding the earlier offline-only restriction. Live verification is recorded in PHASE8-LIVE-VERIFICATION.md and artifacts/phase8/live-2026-10-18/review.html. No commit, push, deployment or publication was performed.

Review: [live report](../artifacts/phase8/review.html). Machine-readable results: [verification.json](../artifacts/phase8/verification.json). Original brief: [request.txt](../artifacts/phase8/request.txt). The 184-file pre-change snapshot and original working diff remain in artifacts/phase8/before; preserve that snapshot and all prior uncommitted work.

## Freeze diagnosis and changes

Earlier live investigation, before the user's current restriction, captured LOW 1280×720 gameplay on the GTX 750 Ti 2 GB. Cold flight reached 1,111.2 ms worst-frame; first-hit damage 3,541.7 ms; rainy first collapse 3,534.9 ms. Warm flight's worst frame was 7.1 ms. The traces contained 6,636 samples in getProgramInfoLog/onFirstUse. First-use shader work was the dominant measured stall, despite high average FPS.

| Problem identified | Implementation response / remaining limit |
|---|---|
| First-use material/program queries blocked rendering | Warm the actual plain, instanced and instance-color variants separately with compileAsync before publishing an asset |
| Identical source weather shaders used separate cache keys | Share the cache key; material textures/uniforms remain distinct |
| Unprepared skyline geometry could render immediately | Gate both detail and complete skyline publication on preparation readiness; keep authored HLOD visible meanwhile |
| First damage created HLOD color storage and another shader variant | Allocate white per-instance color before the initial compile |
| Runtime quantized/interleaved attribute preparation | Decode via Meshopt workers and prepare transforms/bounds/component ranges in a geometry worker; preserve stride, offset and normalization |
| Unbounded competing loads and stalled failures | Two priority jobs, request deduplication/promotion, predictable cancellation, worker failure rejection, partial-asset cleanup and retry |
| Crossing a small LOD cell rebuilt all resident tiles | Refresh at most one queued tile per ordinary frame under the existing integration budget |
| Flight could outrun detail preparation | Score upcoming sectors using velocity/camera direction and a 2.4 s lookahead; prioritize imminent near assets |
| Collapse performed too much work in one update | Share component/time budgets across scheduled damage and simultaneous collapses; rotate processing order |
| Debris/VFX could become the next bottleneck | Quality caps, pooling, sleeping/static conversion, distance simplification, bounded emitters and adaptive destruction pressure |

Texture uploads are spread over animation frames before shader preparation. Geometry/materials remain cached across tile eviction; original collision contours stay resident. Background worker failure falls back for subsequent requests rather than leaving promises pending. Shader compilation, texture uploads, a single floor collider rebuild and source-panel extraction are still indivisible operations: the time budget is cooperative, not a hard maximum for those operations.

Historical raw files: performance-before/results.json and LOW-*-trace.json under artifacts/phase8. Foundation experiments are retained separately. The latest *pre-final* foundation run recorded worst frames of 21 ms cold flight, 27.8 ms warm flight, 388.9 ms first hit and 1,159.7 ms rainy collapse. Those last two still failed the intended latency target. HLOD/readiness fixes and later features followed that run; **there is no final live performance result**. The invalid initial foundation experiment is not successful evidence.

## Streets and assets

The saved 971 placements, 25 original source families, 2048×2048 m world, roads, bridges, landmarks and five districts remain. District names are Crown Exchange, Prism Midtown, Meridian Civic, Saint Vesper Old City and Ironwake Waterfront. The `residential` internal district ID continues to identify Meridian Civic for compatibility.

StreetStandards defines sidewalk widths of 6 / 4.8 / 5.2 / 4.6 / 3.6 m respectively, 3.1–3.6 m design lanes, parking widths, lamp spacing, frontage language and actual cut paving corners. Existing worn asphalt/concrete PBR materials, drainage, slab joints, crosswalks, signals, service alleys, bridge and loading treatments remain. Added entrances, basement grates, shallow stoops, racks, historic fixtures, courtyard boundaries and open gates are authored modules, arranged using the saved plan. Actual same-block historic gaps generate two new frontage connections, not a wholesale replacement of Gothic source buildings. Cosmetic traffic loops are preplanned once, respect the new one-way designations and retain existing population caps. They remain ambient traffic, not a traffic simulation.

Editable new source: `art/environment/phase8/titan-urban-and-fracture.blend`; regeneration script alongside it. The Blender Python API created 15 original modules with eight exported shared materials, UVs and normals. Optimized export: `public/assets/environment/metropolis/phase8-titan-kit-optimized.glb` (185,912 bytes; raw 974,096 bytes; 80.9% smaller). Offline decoded totals: 26,022 vertices and 13,160 triangles across the complete kit; runtime combines same-material parts and instances repeated modules. The complete kit is not drawn per building.

The fragment library has six material families: thin irregular glass, bent steel, exposed-rebar concrete, irregular masonry/stone and layered composite. The corridor frame includes beams, broken concrete, rebar and cable. These are supplemental pieces; intact and falling facade panels use the existing actual source architecture, UVs and materials.

Original building GLBs/LODs, source Blender derivatives, shared source materials, DDS/WebP compression and atlas HLOD remain. No new third-party model was downloaded in Phase 8. All 15 user-provided files in art/external match their recorded SHA256 hashes. Existing attribution remains in `public/assets/environment/ATTRIBUTION.txt` and metropolis/LICENSES.txt. New original-work notice: metropolis/PHASE8-LICENSES.txt. The asset audit does not replace the retained third-party license terms.

## Laser and missile damage

Laser normals now come from the actual collision ray. Surface marks carry material-aware heat: repeated contacts accumulate energy, the white/orange/red shader cools to a ragged dark scorch, and sparks/smoke use the existing bounded effects pool. Glass/steel/concrete/brick/stone/composite have separate heat/cooling responses. Raw energy is serialized so restoring cannot amplify heat. Distant collision unloading preserves saved marks; nearby validation attaches them to surviving geometry or removes them when no surface survives. Marks remain budgeted to 96 globally.

After the heat threshold, sustained hits use the existing component HP/removal path: authored triangles and the corresponding collision are removed. Offline testing cuts real supplied glass geometry. Penetration follows prepared component boundaries; it is not arbitrary runtime mesh cutting. Damage exposes retained support/slab geometry; breakthrough adds a prepared interior frame/floor. There are no complete room interiors behind every window.

`TitanConfig.ts` centralizes missile building settings:

| Mode | Environment / support damage | Radius | Impulse | VFX | Energy per missile | Cooldown |
|---|---|---|---|---|---|---|
| Standard | 3× / 3× | 1× | 1.25× | 1× | 7 | 0.6 s |
| Demolition | 5× / 5× | 1.55× | 2.1× | 1.7× | 22 | 8 s per salvo |

**O** toggles optional demolition; **F** still fires the existing launcher. Each missile latches its mode at launch. Enemy direct damage remains 38, splash 14 and splash radius 3.5; the observer applies the extra multipliers to architecture/environment only. Original missile targeting, pods, muzzle calculations and enemy/player systems remain.

The new blast layer uses six spatial noisy lobes per emitter with a fast detonation/fireball/darkening envelope, plus pooled surface fire, advected smoke, sparks and material fragments. No raster flame icon or copied game effect is added. Existing ordinary combat sparks/shockwave effects remain. Five architecture VFX batches are pooled; transparent smoke and fire are still billboards, without volumetric self-shadowing or scene-depth soft intersections. Live renders are now captured. Their billboard construction and simplified appearance remain visual limitations.

## Titan Breakthrough

**Y**, remappable through the existing aegis-controls storage map. Existing actions and hardcoded movement/melee bindings take precedence over add-on bindings. No edits to Hud.ts or the character rig were required; a small independent accessible status element supplies costs/cooldowns/failure messages.

Activation requires armor, powered flight, at least 18 m/s, forward alignment, 32 energy, a 12 s cooldown and a feasible outside-to-outside trajectory. The planner rejects inside starts, extreme pitch, excessive depth, nearer blocked structures and obstructed exits, including rotated footprints. Asset preparation validates cancellation before touching geometry. Energy is charged once when destructive preparation starts; cancelling before that creates no damage or charge. Cancelling after damage preparation starts does not refund the damage cost.

Entry/interior sections are removed in bounded batches. The far facade remains closed until the actor approaches the exit. The ability requests 70 m/s and sets the existing strike-heading pose hint; the unchanged flight controller continues to apply its normal speed/input limits. The real capsule and swept character controller stay enabled. There is no ability teleport, noclip flag or replacement character animation. Entry, interior rumble and exit use compatible camera/audio/armor hooks. Cancellation after entry opens the prepared exit to avoid trapping the actor.

Corridor frames are instanced, with simple physical floor sections. At most 64 corridors are retained, and only 12 nearby frame sets render. Full collapse removes the corresponding interior floor colliders. Offline fixtures traverse the real supplied mid-rise, Gothic and glass models with the existing Rapier capsule, then restore persistent openings.

## Structural failure and persistence

Facade skins do not carry global structural load. A weighted floor/column graph tracks support loss, integrity and unsupported columns above. One-sided loss drives a directional partial collapse; sufficiently severe low-floor loss on selected full-collapse showcases permits a complete cascade. Original geometry is removed progressively, selected source panels fall, and prefractured material debris/dust supplies bounded motion. This remains an authored destruction approximation rather than a physical structural solver or arbitrary continuous rigid-body fracture.

| Quality | Active architectural debris | Component operations per update | Cooperative work budget | Particles | Blast lobes |
|---|---|---|---|---|---|
| LOW | 16 | 12 shared | 1.5 ms | 64 | 18 |
| MEDIUM | 24 | 20 shared | 2 ms | 112 | 30 |
| HIGH | 32 | 28 shared | 2.5 ms | 176 | 48 |
| ULTRA | 40 | 36 shared | 3 ms | 256 | 48 |

Total retained architecture debris is capped at 80, with at most six source facade fragments. Effects have at most eight blast emitters and 12 fires. The existing 9/16/22/28 active tile caps remain. Sustained slow frames temporarily reduce destruction work/effects to LOW; three calm seconds restore the requested quality. Architectural identity and character/HUD detail are not switched off by that adaptation.

Version 2 snapshots retain component IDs, HP, structural stage and cascade progress, breach plans, thermal/scorch records and up to 80 settled non-source rubble records. `city.exportDestruction()` and `await city.restoreDestruction(snapshot)` expose the data. District streaming keeps damage in memory; there is no new automatic cross-session save UI, and transient airborne source fragments are not saved.

## Verification and preservation

Repeat code/build/asset checks without launching a game:

```powershell
node scripts/phase8-verify-offline.mjs
```

It runs the six Node/Rapier test files, TypeScript, a production Vite build, asset/hash checks and static plan extraction. It starts no server, browser or game. See verification.json, unit-tests.log, build.log, asset-catalog.json, preservation.json and street-standard.json under artifacts/phase8 for the latest exact results.

The changed-file list is in preservation.json. Modified integration files: main.ts, Encounter.ts, HandWeapons.ts, Missiles.ts, Controls.ts and physics/Destruction.ts. World changes: ArchitectureDestruction, City, EnvironmentalDestruction, WorldStreaming, ArchitectureImpactEffects, AssetLibrary, EnvironmentMaterials, UrbanAmbience and UrbanSurfaces. New modules live in src/world/titan and src/world/streaming; offline tests and authoring/report scripts accompany them. Twelve protected source files, including all player/rig controllers, Hud.ts, CameraRig, AudioSystem, InputController and PhysicsWorld, match the pre-Phase-8 snapshot. Package files remain preserved. The initial legacy browser run refreshed generated city-redesign/gameplay-tests outputs; their provenance is archived in the live evidence folder.

Vite's existing large-chunk warning remains, including the Rapier/Three.js bundles. The complete public asset tree still includes both texture alternatives and many source-family LOD files. It has not been certified against a portal download/VRAM budget. GPU memory estimates are not peak residency measurements. Asset readiness and global work caps are code-verified; an actual frame can still exceed a cooperative budget.

## Live acceptance — 18 October 2026

See [PHASE8-LIVE-VERIFICATION.md](PHASE8-LIVE-VERIFICATION.md) for the exact matrix, source fixes, browser history and limitations, and [the live review](../artifacts/phase8/live-2026-10-18/review.html) for 55 screenshots and two unedited silent recordings.

58/58 code regressions and the production build pass. Full browser run: 46/47 before fixing the recessed exit. Post-fix repeated cases: 12/12. Latest unique coverage: 47 passing cases. Production LOW/HIGH smoke and all 28 measured scenes have no recorded browser/HTTP/shader errors.

| Tier / scene | Viewport → render | FPS | p50 / p95 / p99 ms | Worst ms | >50 ms |
|---|---|---:|---|---:|---:|
| LOW / street-traversal | 1280×720 → 1088×612 | 144.0 | 6.9 / 7.1 / 7.1 | 7.1 | 0 |
| LOW / rain-collapse | 1280×720 → 1088×612 | 136.7 | 6.9 / 7.1 / 14.0 | 55.6 | 1 |
| MEDIUM / street-traversal | 1280×720 → 1280×720 | 104.6 | 7.0 / 13.9 / 14.0 | 14.0 | 0 |
| MEDIUM / rain-collapse | 1280×720 → 1280×720 | 91.3 | 7.1 / 20.8 / 27.9 | 76.4 | 1 |
| HIGH / street-traversal | 1280×720 → 1280×720 | 81.3 | 13.9 / 14.0 / 14.0 | 27.7 | 0 |
| HIGH / rain-collapse | 1280×720 → 1280×720 | 72.6 | 13.9 / 20.9 / 34.7 | 69.5 | 1 |
| ULTRA / street-traversal | 1280×720 → 1280×720 | 76.5 | 13.9 / 14.0 / 14.1 | 20.9 | 0 |
| ULTRA / rain-collapse | 1280×720 → 1280×720 | 69.0 | 13.9 / 20.9 / 34.7 | 62.4 | 1 |

Cold-entry traces exposed missing prop/flight shader variants. Warm-up now includes them, isolates readiness with retained material clones, serializes work and uses the HIGH/ULTRA compositor framebuffer. The exit trigger now uses actual reserved collider bounds with a two-step margin; normal capsule collision remains enabled. Added regression tests cover both fixes.

All 18 requested demonstration categories are covered by labeled media. Architectural photo pairs use fixed QA cameras; actual keys drive missiles/laser/breakthrough/suit/movement. Structural collapse stress uses scripted support damage through gameplay destruction and is labeled accordingly. No footage is substituted from an older phase.

- These are short, single-run samples on a GTX 750 Ti 2 GB, with the desktop and other user applications still running. They establish measured behavior, not a minimum-FPS guarantee. LOW uses 0.85 rendering scale; other tiers use 1.0 at device DPR 1.
- Cold entry and stress frames can exceed 50 ms. Initial asset/shader preparation remains significant. No zero-stutter or Poki/CrazyGames certification is claimed.
- GPU allocation counters were sampled after each timed scene. They are point measurements, not peak VRAM. Machine totals include the desktop and unrelated applications.
- Intact architecture remains the supplied source models. Streets still have broad, quiet stretches, stylized trees/props and visible repeated families. Night surfaces do not provide full scene reflections. This is not a completed premium visual art pass.
- Damage follows authored sections and an approximate support graph. Collapse removes those sections in stages; the final ruin can be sparse under strict debris caps. It is not continuous mesh fracture or a physically complete structural simulation.
- Breakthrough corridors have repeated exposed frame/floor dressing, not fully furnished building interiors. Smoke/fire use pooled billboards. Active body, effect, scar and corridor caps deliberately discard excess detail.
- Streaming preserves destroyed state in memory and the snapshot API restores it. There is no new automatic cross-session save UI. Large Rapier/Three.js chunks and the full asset download remain deployment work.

Start with `npm.cmd run dev -- --host 127.0.0.1 --port 5192 --strictPort`, then open the MAIN / route. H shows controls; Y is aligned armored breakthrough; O toggles demolition; F fires. /?qa=1 enables explicit developer mutation hooks. Normal gameplay has only read-only aegisDiagnostics(). Live scripts require PHASE8_LIVE_VERIFICATION=1.
