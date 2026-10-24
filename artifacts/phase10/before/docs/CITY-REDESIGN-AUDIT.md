# AEGIS city redesign audit — 12 October 2026

The current city is a working integration, not an acceptable finished environment. Passing gameplay tests did not establish urban design quality. The redesign preserves player, combat, input, camera and HUD implementations and changes their environment through the existing City/destruction contracts.

## Ten biggest problems

1. **Too little built frontage.** The 571 placements occupy only 12.55% of the 2048-square-metre world. Most small buildings sit in large paved parcels. Reduce gaps, place buildings at real setbacks and fill blocks with perimeter frontage and interior service alleys.
2. **The road graph is a uniform test grid.** Fixed 15/25-metre lines, a diagonal drawn through the grid, and paving strips are generated separately from building plots. Roads, curb corners, blocks, plazas and parcels must be produced from one saved plan; every footprint needs a clearance check.
3. **Sidewalks have no urban grammar.** Current sidewalks are broad uninterrupted quads. There are no consistent slab joints, curb returns, drainage, accessible corner transitions or utility placement. Use authored sidewalk/curb modules and a sector surface shader, with district-specific widths and entrance treatments.
4. **Gothic content is used as mass filler.** There are 159 Gothic placements, many thin spires, open frames and detached ornamental kits. The highest repeated families occur 23–24 times. Remove these assemblies from ordinary block filler; keep a small set of complete landmarks surrounded by masonry streets.
5. **The skyline has little hierarchy.** Heights range from 4 to 168 metres with repeated silhouettes, weak transitions and limited landmark prominence. Financial towers need clustered peaks, midtown shoulders, a civic foreground and a restrained Gothic counterpoint.
6. **Far rendering carries too much source detail.** LOW street: 185 draws, 16.34 ms mean; combat: 357 draws, 22.05 ms mean. HIGH street: 366 draws, 25.95 ms mean. Material/family instance pools submit many meshes and dense distant windows/roof objects. Add a shared-atlas silhouette/impostor tier and block HLOD; restrict source detail to nearby buildings.
7. **Startup loads all far source families and their PBR textures.** The previous scene estimate is about 185.7 MB of source textures; the premium directory is about 305 MB. Loading 45 far GLBs defeats district streaming. Startup should load a compact horizon/block atlas and essential spawn assets, followed by nearby source models on demand.
8. **Destruction reads as grid-cell removal.** Four-metre floor and five-metre bay cuts disappear, generic shard shapes fall and the same support cascade is available to every building. Use persistent surface scorching/heat/smoke first, local authored panel damage second and structural/full collapse only on designated showcases.
9. **Street life is a repeated moving strip.** Cars wrap on fixed parallel lanes; only a few prop types repeat at building-relative offsets. Use road-based traffic paths and stops, sidewalk prop sockets, pedestrians with cheap animation, and deliberate service/loading areas.
10. **The edge and quality strategy expose the prototype.** A circular grey shoreline, sinusoidal water aliasing and isolated horizon buildings reveal the map boundary. Quality mostly changes resolution/shadows/radius; LOW lacks an intentional presentation budget and ULTRA lacks a matched performance report. Replace the ring with continuous outskirts/harbor composition and profile all four tiers.

## Evidence and constraints

- Existing reproducible measurements: `artifacts/phase7/final/combined-performance.json` and `verification-summary.json`.
- Existing views: `artifacts/phase7/final/`; visible empty pavement, repetitive Gothic assemblies and shoreline ring are direct visual failures.
- Initial archive for this rebuild: `artifacts/city-redesign/before/`.
- Core protection: keep the deployment bay, mission court/checkpoint and flight course anchors; retain the existing hero/pilot/animation/weapon/HUD files byte-for-byte.
- Source originals in `art/external/` remain unchanged. Existing licensed building sources are reused; the Quaternius CC0 modular pack and CC BY street props provide additional authored components.
- Performance comparisons must record actual internal resolution and the same poses/weather. No unreported render-scale reductions.

## Performance diagnosis

The expensive work is primarily GPU rendering: too many family/material draws and source triangles outside the useful detail range, plus shadows/postprocessing on higher tiers. The previous physics mean is much smaller than frame time, but 6,000-plus resident floor-band colliders and per-frame prop traversal are unnecessary browser costs. Decals/effects currently do not provide enough visual damage information before geometry removal. A more convincing city therefore needs fewer expensive far meshes, better ground/detail composition and more useful local damage feedback, rather than simply more buildings or simulation pieces.

## Issues found during the rebuild's browser validation

Quantized Int16 source positions could overflow when metre-scale transforms were baked into them; this folded lamps/civilians. Attributes now convert to Float32 before placement transforms. A roof material depth bias applied to the ground hid road layers from altitude; only road/paving/paint own the appropriate bias now. Distant atlas materials retained Blender's disabled depth write, letting water overpaint architecture; the opaque alpha-tested atlas now writes depth. Sparse outskirts and inconsistent sky/water fog output space exposed a horizon seam; denser source-view scenery, altitude haze and shared render-space fog color now blend it.

The first 34-case browser run had four failures. A counter case passed on isolation and the subsequent full run; character/combat code stayed unchanged. A walking test had assumed its first ray hit a building but hit street furniture; its setup now filters to the actual building colliders. A disposal test asserted the old high collider count; it now checks complete building coverage, a bounded optimized count and zero colliders after disposal. A penetration case fired from inside a neighboring source hull and then inspected targeting before simulation had populated contacts; it now starts from the clear showcase plaza and waits for the real contact before testing occlusion and penetration. The subsequent full 34-case run passed without failures or retries. A separate collapse/restart signage regression was added after the final visual review.

The original six-scene benchmark at 1280 × 720 / DPR 1 measured LOW street at 85 FPS, 133 draws and 1.11 million submitted triangles; LOW combat at 48.7 FPS, 358 draws and 4.24 million triangles. Average simulation costs were about 0.48 and 0.94 ms respectively. HIGH combat reached 676 draws and 7.36 million submitted triangles including extra passes. These measurements support the rendering diagnosis; they do not establish a single isolated shader as the whole cause. Final matched and native-resolution results are in the handoff and local review.
