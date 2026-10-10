# AEGIS: Rise of the Titan

An original browser-first action-game prototype. This repository is the Phase 1 foundation, built from procedural geometry and effects; it contains no third-party character, logo, music, or game assets.

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

Open the local Vite address, click the scene to link the mouse camera, then use:

- `WASD` — move / steer in flight
- `Space` — jump on the ground, ascend in flight
- `E` — take off, or begin landing
- `Shift` — boost (uses core energy)
- `Q` or `S` — air brake
- `Ctrl` — descend while flying

Use the HUD quality control to choose LOW, MEDIUM, HIGH, or ULTRA. It persists the choice and reloads to rebuild the world at that level.

## Status

### Implemented — Phase 1

- Vite + TypeScript + Three.js browser architecture.
- Modular input, third-person camera, player, suit, flight VFX, city, and HUD domains.
- Original procedural AEGIS armor silhouette and compact procedural city.
- Ground movement, sprint, jump, and momentum-aware takeoff / hover / cruise / boost / brake / landing states.
- Speed-sensitive cinematic camera, FOV shift, takeoff shake, engine glow, and pooled speed lines.
- Quality presets that reduce pixel density, shadowing, city density, and VFX density.

### Partial

- The city is visual-only during this phase: the ground and world edge are functional, but buildings do not yet have collision.
- Animation is procedural armor posing, not authored skeletal animation blending.
- The suit-up cinematic is represented by the powered-up arrival presentation; its replayable assembly sequence belongs to the cinematic phase.

### Not implemented yet

- Combat, target locking, enemies, missiles, AI, grab/throw.
- Physics/ragdolls and the impact pipeline (Rapier is intentionally deferred to Phase 3).
- Destruction, mission events, boss framework, cinematics, audio, progression, and persistent world streaming.

## Next milestone

Phase 2 should add one ground drone/hunter, soft lock, energy cannon, responsive melee hit reactions, and a small data-driven encounter. Phase 3 can then introduce Rapier with a deliberately bounded active-body count and a blendable ragdoll recovery path rather than integrating physics across the entire scene prematurely.
