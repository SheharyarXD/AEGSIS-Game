# Phase 10 implementation audit and plan

Baseline: the working tree, not Git HEAD. `artifacts/phase10/before/snapshot.json` records 251 pre-edit sources, scripts, tests, documents and the original Phase 9 Blender kit. Existing uncommitted work is preserved. Phase 7–9 handoffs, source assets, licenses and current performance evidence have been inspected. The Phase 10 request is retained verbatim in `artifacts/phase10/request.txt`.

## Audit

1. Phase 9 Y is explicitly stationary; it never owns locomotion. Replace its orchestration, retain real missiles, finite 3/3/2 load, costs and source component damage.
2. There is no ability camera. Add a separate collision-constrained camera director using the existing CameraRig; preserve the normal camera source.
3. Existing player.control(enabled=false) zeros velocity. Skip that call while the ability owns movement and use CharacterBody.move directly, never teleport/setEnabled(false).
4. Encounter weapon input needs an explicit ownership flag. Continue simulation, targeting and missiles while suppressing regular attacks.
5. Real missile contacts and the shared damage scheduler already exist. Gate transitions on these events and actual capsule sweeps, not presumed impact times.
6. reserveBarrage checks the corridor but lacks a full exterior approach/runway check. Validate both plus world bounds before energy commitment, and recheck while moving.
7. Source assets and shader variants are prepared by AssetLibrary. Preload approach/exit sectors and require the prepared interior kit before committing.
8. Existing breach interiors repeat generic fracture frames. Author distinct office, masonry and utility modules in Blender, instance only near persistent corridors, keep all detail outside the swept capsule.
9. Materials already share compressed PBR atlases; improve scale, roughness variation, contact dirt, wet puddle response and window depth without more unique texture sets or dynamic lights.
10. Streets already use authored curbs, ramps, grates, frontages and low-count ambience. Refine planned frontage bays and lighting rather than regenerate the saved city or add uncontrolled props.

## Implementation order

1. Capture matched MEDIUM street/day/rain/night performance and actual-input stationary Y / O-F baseline before source edits.
2. Implement ACQUIRING → DEPLOYING → BARRAGE → ENTRY_CONFIRMED → ACCELERATING → INTERIOR_TRAVERSAL → EXIT_IMPACT → RECOVERY → COMPLETE, with ABORTED and IDLE states.
3. Keep motion continuous through the Rapier character controller. Collision failure stops at the last safe position; no fake completion or forced geometry clearing. Blend camera, flight pose, launcher animation and existing audio hooks.
4. Author/save/export original family-specific corridor structures and entry/exit fragments; use pooled directional blast layers and actual geometry damage.
5. Improve shared materials, wetness, warm/cool night composition and coherent street frontage detail. Roll out through existing saved sockets and shared shaders.
6. Run meaningful state/physics/failure tests, production build, asset/preservation checks, actual Y recordings (ground/hover/roof/glass/Gothic/night), O/F regression, matched screenshots and serial performance captures.
7. Publish only local evidence and a candid handoff. No commit, push, deployment or publication.

## Preservation and acceptance

The character rig, player controller, HUD, audio, input and physics sources are preserved unless a demonstrated integration need requires an explicit small change. Keep 971 saved buildings, 25 original source families, five districts, 2048 m world, O/F support failure, thermal damage and persistent destruction. No proprietary assets or shaders. No simulated component swarm, new full-screen reflections or uncontrolled light counts. Live evidence must establish automatic physical movement and restored controls; older Phase 9 stationary assertions remain historical and are superseded only where this request changes Y semantics.
