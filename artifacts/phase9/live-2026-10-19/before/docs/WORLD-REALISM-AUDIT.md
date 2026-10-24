# AEGIS world realism audit — 15 October 2026

This pass starts from the current integrated world, including the newer complete skyline meshes, sparse damage-index updates and exact merged collision surfaces. Those corrections are retained. The active IDE's unrelated crypto audit is outside this task.

1. Road paint is very clean, uniform and disconnected from approach lanes. Crosswalks need stop bars, lane separators, turning arrows and restrained wear.
2. The road surface repeats at three metres; repaired asphalt, tire/oil variation and localized wetness need different scales.
3. Sidewalks share the generic stone material and its masonry atlas. Dedicated concrete slabs, expansion joints, curb bands, stains and recessed utility treatment will read better.
4. Furniture repeats on a 31-metre cadence with little frontage logic. Entrances, corners, loading courts and clear walking lanes need separate placements.
5. Curb ramps are added over otherwise unbroken curbs. Corner gaps and correctly oriented ramps should join the painted crossings.
6. The hero street lacks the density of small commercial details: newspaper boxes, dumpsters, awnings, storefront signs, construction rails, service entrances and pedestrian signals.
7. Tree crowns remain conspicuously faceted. Existing foliage needs finer authored silhouettes at street distance without expensive transparent leaf layers.
8. Local lights follow building centers; few street lamps illuminate pavement. Use a fixed local light budget and batched emissive lenses, luminaire pools and wet streaks tied to actual street fixtures.
9. Existing fire is one symmetric billboard; smoke uses small identical round point sprites. Repeated damage resets a timer without enough variation, advection or damage-weighted plume development.
10. Scorch/fire attachment is position-only. Damage geometry can disappear while effects remain at the old surface, and structural cascades lack an explicit dust/plume event. Effects need building IDs, attachment validation, controlled structural bursts and smooth dissipation.

Implementation order: preserve current source; record matched baseline; author a small street detail kit in Blender; polish Crown/Prism avenue blocks around X=232, Z=-496..-336; extend frontage/corner/service rules through all districts; refine dedicated street materials and constrained lights; rebuild pooled facade VFX; profile the same day/wet-night/damage scenes in every quality tier; validate the existing gameplay and newer visibility/collision regressions. Archive actual browser views and raw timings under artifacts/world-realism.

Budgets: keep existing render scales and source building LOD/visibility rules; no additional shadow-casting point lights; street fixtures use shared materials and instance pools; smoke/fire have hard quality caps and distance limits; detailed collision remains separate from decorative assets. No building source is replaced with a primitive proxy in this work.
