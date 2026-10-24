# Phase 9 audit and implementation plan

The 223-file snapshot in artifacts/phase9/before preserves the working Phase 8 implementation and existing user edits. Original licensed architecture and player/HUD/physics sources remain immutable. No commit or deployment is authorized.

## Ten concrete Phase 8 gaps

1. TitanBreakthrough gates on flight, speed and alignment, then assigns player velocity each step. Replace its gameplay orchestration entirely.
2. prepareBreach removes entrance/interior geometry before any projectile exists. Reserve components without removing them; impacts must advance the passage.
3. Exit opening depends on player progress. Replace that trigger with a final missile wave and an actual capsule clearance query.
4. The missile magazine has eight rounds and one aim point per ordinary salvo. Add a reserved eight-round ability with three independently aimed waves (3/3/2), preserving ordinary guidance and enemy damage.
5. Heavy blasts only reach components inside a small radial volume. Add attenuated load-path transmission to actual core/column nodes at the struck floor.
6. Complete failure is restricted to four marked showcases. Permit support-driven complete failure on authored families while keeping simultaneous work globally bounded.
7. Source triangles disappear floor by floor without a moving upper mass. Present falling, rotating bands of the original source architecture, followed by authored ruins.
8. Eighty small fragments leave almost no visible footprint. Add material-specific Blender ruins with near/mid/far LODs and persistent major collision.
9. Existing breach frames and smoke repeat visibly. Add irregular material-specific linings, exposed services and lit, evolving smoke density.
10. The street pass has many props but repetitive frontage and quiet broad roads. Compose a complete review block, then use deliberate frontage sockets and district-specific service/courtyard treatments across the saved plan.

## Master plan and order

Keep the 2048 m fixed world, roads, building locations, source family identities and five districts. Financial receives corporate thresholds, planters, lobby signs and loading edges. Midtown receives varied shops, canopies and bus/parking frontage. Civic receives stone entrances, railings and public notice boards. Gothic receives connected courtyard boundaries, arched entrances and ornamental fixtures. Industrial receives trusses, pipe/service frontage and loading enclosures. Repeated authored modules are instanced, close detail distance-limited, and emergency/walking paths kept clear.

Implement and validate stationary Y on office ID287 first. The camera ray selects the real building; preflight checks range, exit, corridor contents and resources. Acquisition/deployment uses the existing armor/launcher APIs. Eight real collision-tested projectiles launch in three waves. A successful impact opens only the next reserved section. Never assign player velocity, teleport or disable collision. Completion requires an enabled player-capsule sweep through the route. Player movement through it is subsequent ordinary input.

Then tune O/F structural blasts against actual low-floor core/perimeter nodes, with height-dependent resistance and spatial attenuation. Demonstrate full skyscraper failure using actual O/F keys, no demonstrate()/support injection. Animate source bands with gravity/tilt and ground impacts; add substantial authored, collidable ruins. Snapshot restore and distance LOD must reconstruct them.

Author original supplemental Blender geometry, retain .blend and raw GLB, optimize with Meshopt, share materials and bound active pieces. MEDIUM is the primary art/performance tier. Record matched before/after street/flight routes and real barrage/demolition/stress, including p95/p99/worst, GPU allocations and resource counts. Retain failures. Inspect actual renders; passing tests alone is not art acceptance.
