# AEGIS repository audit — 10 October 2026

Audit performed before source changes. All 13 original source/config files, package and lockfile, README and entry HTML inspected. Original source retained in `artifacts/baseline-src/` because this directory has no Git repository. This is a small Three.js traversal prototype, not an existing combat game.

| Priority / severity | Evidence | Consequence / correction |
|---|---|---|
| P0 critical: no world collisions | `PlayerController.update` directly adds velocity to position, clamps world edge and hardcodes ground at 0.9; City exports no collision data. | Traversal passes through buildings; grounded pose floats/clips. Add fixed-step Rapier capsule movement, surfaces, swept collision queries and dynamic impact bodies. |
| P0 critical: primitive hero | `AegisSuit` builds rounded boxes, spheres and cylinders; no asset files, bones, skins, AnimationMixer or clips. | Unconvincing anatomy, toy silhouette and sliding sinusoidal gait. Source a licensed, textured, rigged asset; blend authored clips, retain procedural posing only for animation gaps. |
| P0 critical: core slice absent | No enemy, combat, mission, boss, projectile, physics or destruction modules. README correctly labels these as absent. | Must implement a small connected encounter rather than present the existing flight prototype as a completed game. |
| P1 high: reflection / material mismatch | Metalness 0.83–0.96 and envMapIntensity up to 1.8, but scene.environment is never assigned. Roughness uses an unfiltered 32px pattern. | Dark or plastic surfaces with no readable reflection structure. Establish IBL, authored normal/ORM textures, restrained emission and balanced warm/cool lighting. |
| P1 high: incoherent city | Random overlapping boxes, each wrapped in one translucent emissive cube; no facades, sidewalks, furniture, landmarks or colliders. Signed remainder road exclusion is asymmetric for negative coordinates. | Poor scale and navigation. Authored block layout with instanced architectural detail, clear flight corridor and destructible combat court. |
| P1 high: control / heading problems | Camera forward starts +Z; right basis is negated; yaw is scalar-damped across ±π. Player Y pitch always positive. Input taps persist until consumed and pointer lock rejection is unhandled. | Sideways controls can be reversed, long spins near wrap, stiff flight, stale actions. Correct camera basis, shortest-angle turn, frame-end input clearing and focus pause. |
| P1 high: no physical impacts | No physics engine import. Lock contains a dev transitive Rapier package, which is unused. | Ragdoll and destruction cannot be added cosmetically; use jointed rigid bodies mapped to the real skeleton, bounded debris, shared impact pipeline. |
| P2 medium: camera clipping | CameraRig only lerps a desired position with no collision tests. Initial position is opposite the computed follow position. | Intro swing and walls blocking view. Collision-aware boom and explicit cinematic/control transitions. |
| P2 medium: performance unknown | ~80 individual suit meshes, 4 world point lights plus thruster lights; shadow frustum 220m at 1024px; DOM updates every render. | Many suit calls, coarse contact shadows, no budgets. Measure on host GPU, instance facade details, bound particles/bodies, expose frame diagnostics and reduce quality cost. |
| P2 medium: misleading scalability | Quality changes building count, therefore world layout; unused stateTime/lastMove; no lifecycle apart from input disposal. | Settings alter navigation; no reproducible test route or reset. Keep collisions/layout identical across settings and centralize restart. |
| P2 medium: no QA | Only dev/build/preview scripts, no tests or errors/loading UI. | Build success does not demonstrate playability. Add deterministic physics tests, browser input/mission/restart checks, screenshot and frame-time captures. |

## Baseline verification

`npm.cmd run build` passed (TypeScript + Vite 7.3.7). JS bundle 565.61 kB / 144.03 kB gzip. Vite warns about a >500 kB chunk. No pre-existing tests to run. Dependencies resolve Three 0.186.1, types 0.186.0, TypeScript 5.9.3. No custom shaders, imported environments, rigs, animation assets or sound assets exist. The original FlightState, module boundaries, seeded generation, VFX pool and quality-selection concept are useful and retained/adapted.

## Order of implementation

1. Real local rigged asset with provenance; fixed-step physics foundation, render lighting baseline, correct controls.
2. Compact authored district and hangar; capsule collision, physical flight, camera sweep, locomotion blending.
3. Shared impacts, jointed ragdoll and recovery, physical fracture sections; meaningful automated tests.
4. Small ground/aerial encounter and a multi-phase TITAN-09, connected objectives and restart.
5. Running-browser review, measured optimization and honest limitation/remaining-work report.

Reference image is art direction, not supplied runtime assets. AAA photorealism cannot be claimed from this asset budget or WebGL renderer. No promise of a fully authored modular suit-up or bespoke mocap set without such assets.
