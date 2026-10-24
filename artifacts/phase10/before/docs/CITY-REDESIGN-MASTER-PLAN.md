# AEGIS metropolis master plan — 12 October 2026

This plan precedes implementation. The navigable world remains 2048 × 2048 metres. A continuous visual outskirts belt extends beyond it, while the existing recovery system bounds play. The protected deployment/mission compound stays integrated in the central avenue; surrounding blocks are rebuilt from the same road/parcel plan.

## District plan

| District | Existing integration ID | Center | Built character and skyline |
|---|---|---|---|
| Financial Core / Crown Exchange | financial | (260, -520) | Glass/steel towers, 100–240 m peaks near the core, 55–110 m shoulders, 6 m sidewalks, premium lobbies, selective plazas |
| Midtown / Prism Mile | commercial | (-40, 250) | Continuous 35–100 m office/apartment frontage, corner buildings, storefronts, alleys, mixed rooflines, 4.5–5.5 m sidewalks |
| Civic / Meridian | residential | (-570, 430) | 20–65 m masonry, brownstones, Art Deco civic buildings, one courthouse/archive plaza, planted sidewalks and stoops |
| Old City / Saint Vesper | gothic | (-610, -550) | Masonry perimeter blocks plus a few complete Gothic landmarks; spires form a hierarchy rather than a forest |
| Ironwake Waterfront | industrial | (650, 540) | 8–35 m warehouses and brick works, loading courts, freight alleys, cranes, utility structures and the retained bridge |

## Roads, blocks and sidewalks

- Saved avenue/secondary-street hierarchy; avenue widths 24–28 m and local streets about 16 m. District boundaries align with blocks and major streets.
- Compact rectangular blocks with frontages, courtyards and 5–7 m service alleys. Building placement is derived from street setbacks and verified against every road corridor.
- Financial tall parcels are assembled from wider plots. Midtown/civic blocks use several compatible complete buildings plus authored storefront/entrance modules. Ordinary Gothic streets use masonry families.
- Sidewalk standards: paved slab modules, distinct curb edges, corner ramps, joints, drains, manholes, tree pits, utility covers and wear. The furniture strip stays clear of the pedestrian route.
- Crosswalks/stop lines sit at actual intersections. Loading/parking lanes belong to the road hierarchy. Traffic signals and lamp spacing follow corners and block fronts rather than individual building centers.
- Preserve deployment bay/court/course coordinates, the checkpoint encounter and the harbor bridge/ramp. New street sectors connect to the compound without paving through these anchors.
- The east X=940 plan line bounds the last parcels. It is not a paved street: road geometry ends at X=880 and the harbor starts farther east. The 2048-metre navigable footprint and recovery system remain unchanged.

## Landmarks and architectural families

- Crown Helix: supplied London curved glass tower, treated as a hero asset with a deliberate plaza and service roof.
- Northlight: supplied Singapore office tower on a larger Financial parcel, creating a second skyline peak.
- Meridian Citadel: complete Art Deco source adapted as a civic landmark, with surrounding lower frontage and a real entrance plaza.
- Saint Vesper: the complete tall Gothic source, plus selected civic/cathedral architecture; no repeated isolated frame/spire grids.
- Ironwake showcase warehouses: lower masonry/industrial sources, open service courts and clearer destruction sightlines.
- Maintain category tags: landmark, hero tower, standard tower, mid-rise block, corner, service, industrial. Existing whole source buildings remain near-detail assets; authored Quaternius facade/roof modules add controlled block/entrance variety.
- Use saved family assignments and orientation rules. Variation is architectural and material/roof/entrance based; runtime randomness does not invent primary box skyscrapers.

## Browser rendering plan

| Tier | Useful source detail | Distant presentation | Working target |
|---|---|---|---|
| LOW | Small nearby set, 1K source maps, no costly city shadow pass | Shared-atlas block proxies/impostors, readable street detail | Approximately 100 draws and under 500k submitted street triangles including the hero where practical |
| MEDIUM | More near detail and one bounded shadow region | Same coherent HLOD city | Approximately 130 draws; preserve readable facades and sidewalks |
| HIGH | Hero roofs/facades, selective local shadows/lighting | Shared far atlas, no distant high-poly windows | Approximately 170 draws; quality costs explicitly measured |
| ULTRA | Wider detail/shadow/effect budget | Same plan and asset families | Measured separately; no 60 FPS guarantee on GTX 750 Ti |

Targets guide profiling; they are not claimed measurements. Preserve the existing per-tier resolution unless changes are explicitly documented. Use material-based batching where supported, a portable instancing fallback, sector streaming, source geometry only near the player and simplified far lighting. Startup loads the small shared city representation rather than all detailed family GLBs. Collision uses a small number of stable source-shaped hulls per building and sparse detailed contact only for nearby damaged sections.

## Damage hierarchy

1. Every building: localized scorch/chipping/glass feedback, pooled sparks, side-oriented smoke, optional small persistent flame and heat glow.
2. Repeated/heavier damage: selected pane/panel/corner removal, actual holes, source-shaped debris and local collision updates.
3. Designated major showcases: exposed floors, support failure and persistent partial collapse.
4. Selected showcase buildings only: full collapse. LOW/MEDIUM never simulate the whole city; dynamic debris and smoke/fire pools have hard caps.

Damage records survive sector eviction without keeping heavy damaged meshes or dynamic bodies alive. Distant damaged buildings use a simple burned/damaged proxy; nearby detail is rebuilt from the saved IDs. Visual chunks use authored/source-derived irregular panels and shards, not generic cubes as the primary effect. Legacy checkpoint destruction and combat callbacks remain compatible.

## Horizon and atmosphere

Remove the circular water/shore ring. Put the harbor to the east, add quay/industrial silhouettes and bridge continuation, and extend land/street/HLOD silhouettes north, west and south. Distance haze and skyline cards blend into the existing GPU sky. Water uses filtered lower-frequency shading to avoid screen-space moiré. Day, dusk, night and wet weather retain visible entrances and street edges.

## Validation gates

1. Finish the saved block/road plan and asset selection; audit footprint/road collisions and forbidden Gothic filler.
2. Inspect downtown, sidewalk close-up, roofs and high altitude in the real MAIN game. Correct composition before counting tests as success.
3. Inspect a missile impact (flash, side flame/smoke, persistent char), repeated panel damage and a designated collapse.
4. Verify walking, running, suit change, flight/boost/landing, combat, targeting, HUD and world recovery through the preserved implementation.
5. Profile street, roof, wet night, aerial, combat and destruction for LOW/MEDIUM/HIGH/ULTRA at declared resolutions. Archive exact previous/new camera views and raw performance.
6. Run build, relevant unit/browser checks, preservation/asset/license audits and a production URL smoke check. Publish the result and remaining limits in the local review/handoff, with explicit run commands.
