# AEGIS: Rise of the Titan

A browser action-game prototype built with Three.js, TypeScript, Vite and Rapier.

## Run

Install [Git LFS](https://git-lfs.com/) before cloning. Models, Blender sources,
textures and gameplay recordings are stored in LFS. In an existing checkout,
download the real assets before starting the game:

```powershell
git lfs install
git lfs pull
```

```powershell
npm.cmd install
npm.cmd run dev
```

Open the address Vite prints and click the scene to capture the mouse.

| Command | What it does |
|---|---|
| `npm run dev` | Game at `/`, character studio at `/scripts/character-preview.html` |
| `npm run build` | Type-check and production build |
| `npm test` | Physics unit tests |
| `npm run test:browser` | Playwright gameplay tests (needs Chrome) |
| `node scripts/hero-qa.mjs` | Opens the character studio in Chrome and captures the review stills into `artifacts/hero-qa/` |
| `node scripts/hero-capture.mjs [scenario ...]` | Records real-browser video of walking, the transformation and flight, with frame strips and foot-slip numbers, into `artifacts/hero-video/` |

## Controls

| Key | Action |
|---|---|
| `W A S D` | Move / steer |
| Mouse | Look |
| `T` | Suit up / step out of the armour (on the ground) |
| `E` | Take off. In flight: cut the thrusters and fall. While falling: catch yourself (armour only) |
| `Space` / `Ctrl` | Jump or climb / descend |
| `Shift` / `Q` | Sprint or boost / air brake |
| `LMB` or `J` | Light attack. Press again during a strike to chain jab → cross → hook. In flight: fly in and strike |
| `R` or `K` | Heavy strike. With `Shift` held on the ground: thruster dash into the strike |
| `G`, `C`, `V` | Grab-throw, ground slam (a powered dive from flight), finisher (armour only) |
| `F` | Shoulder missiles: the launchers deploy and fire a pair |
| `Y` | Titan Breach: automatic 3/3/2 missile barrage, physical building traversal and explosive exit |
| `O` | Toggle structural demolition; `F` fires the heavy demolition salvos |
| `N` | Missile guidance: soft lock (best target near the reticle, out to 260 m) → hard lock (the `Tab` target) → off |
| `Z` (hold) | Palm repulsors; they also shoot down incoming missiles |
| `L` (hold) | Focused beam from the right palm |
| Mouse (in flight) | Steers in three dimensions: look up to climb, down to dive, sideways to bank. In the hover the view is free |
| `RMB` or `B` | Guard (held). A light attack just after blocking a hit is a counter |
| `X` | Dodge in the direction held (back if none). In flight: a rolling evade |
| `Tab` | Lock the best target on screen; again for the next; past the last releases the lock |
| `Esc` / `H`, `F3` | Pause / manual, performance diagnostics |

Flight, suit, missile, guidance, repulsor and beam keys can be rebound: see
[src/input/Controls.ts](src/input/Controls.ts).

## The hero

The player has two forms that share one skeleton and one set of animation clips:

- **AEGIS armour** — an original suit modelled for this project. Source, build
  pipeline and editable `.blend`: [art/aegis-hero/](art/aegis-hero/README.md).
- **The pilot** — the unsuited character. Walks, runs and jumps; no flight or combat,
  and takes far more damage.

Each form has its own motion-captured idle, walk and run, shaped to its character:
the pilot is relaxed and upright with his arms at his sides; the armour walks heavy
and aggressive, with clenched fists, flared elbows, squared shoulders, a lowered head
and a wide stance. The gait is advanced by the distance the body covers, so feet stay
planted at any speed.

**Transformation (`T`, on the ground, about 5.8 s).** The armour arrives as separate
components. Each one flies in under its own small thruster, trailing smoke, brakes
beside the body, then rotates into alignment and locks: boots and lower legs,
thighs and pelvis, back then torso and emblem, arms and hands, the propulsion pack,
and last the helmet, whose faceplate closes over the pilot's face before the visor
lights. Stepping out releases the components in reverse order in about 3.5 s; they
back off, light their thrusters and fly away. The choreography is authored in
`src/player/assemblyManifest.ts`; the component thrusters and smoke are
`src/vfx/PartThrusters.ts` (two draw calls, only while something is burning).

**Flight.** Forward flight goes where the view points, in three dimensions; the body
lies along its actual path, nose up in a climb and down in a dive, and rolls about
that path in a turn. In the hover he stays upright and the view moves freely. Takeoff,
hover, cruise, boost, braking, banking and free fall are authored poses blended by
what the body is really doing: speed, climb angle, thrust and how hard the view is
turning. Arms and legs spread in the hover and cruise and draw in as speed
rises, to a dart at full boost. The character is drawn between physics steps, so he
moves smoothly on displays faster than 60 Hz.

**Free fall and landing.** With the thrusters cut he falls under gravity (24 m/s²,
terminal 62 m/s; `Q` spreads into an air brake). The landing is graded by the measured
impact speed: soft, medium, or a heavy three-point landing with a fist on the ground,
dust, a shockwave and camera shake. Beyond about 44 m/s it costs armour.

**Aiming and targeting.** The camera looks along the aim line itself, so whatever is
under the reticle is what the weapons converge on at any distance. Soft lock scores
every visible enemy by how close it is to the reticle, its distance and how many
missiles are already heading for it, with hysteresis so it does not flicker between
targets; nothing is locked through solid scenery. A pair of missiles is shared between
targets when there is more than one ([src/combat/Targeting.ts](src/combat/Targeting.ts)).

**Close combat.** A bladed fighting stance when an enemy is near, a three-hit
combination, a committed heavy strike, a held guard with a counter, directional
dodges, a thruster dash strike and an aerial strike, all authored clips. Presses are
buffered; a strike only hurts while its fist is actually on the target during the
move's active frames ([src/combat/Melee.ts](src/combat/Melee.ts)).

**Sound.** Everything is synthesised in [src/audio/AudioSystem.ts](src/audio/AudioSystem.ts):
no sampled or downloaded audio, so nothing to license. Sounds out in the world are
attenuated and panned by where they are; each cue has a voice limit, and the beam's
tone is a single loop that starts once and stops with the beam.

**Weapons.** The shoulder launchers are part of the armour model: a cap on each
shoulder blade swings back and a four-tube pod rises from beneath it. Missiles leave
the tubes, fly straight until clear, then steer at a bounded rate toward a lead point
on their target. Eight rounds, reloading while stowed. The hand weapons raise and aim
the arm first, so the palm faces the target before anything leaves it.

**Propulsion.** Back, palm and boot thrusters are one draw call of shader-driven
plumes (hot core, blue exhaust, soft envelope, turbulence, shock cells). The plume
keeps its size at every throttle setting; more thrust shows as a hotter, denser,
faster-churning jet. Hover, takeoff, cruise, boost, braking, free fall and landing
each drive the six jets differently. The graphics quality setting scales the
effect; `?quality=LOW|MEDIUM|HIGH|ULTRA` forces it in the studio.

The **character studio** (`/scripts/character-preview.html`) shows the real in-engine
model with orbit controls, camera presets (full body, helmet, chest, arms, hands,
legs, boots, propulsion), every locomotion and flight pose, the suit-up and step-out
sequences, three lighting presets, and toggles for emission, clay (one matte
material, emission off), bloom, turntable, wireframe and form.

## Assets and licences

| Asset | Origin | Licence |
|---|---|---|
| `public/assets/aegis-hero.glb` | Original armour (this repository) on the Godot TPS demo skeleton and clips | Model: project-owned. Rig and clips: CC-BY-3.0, see `public/assets/LICENSE-godot.txt` |
| Idle, walk and run clips of both forms | Retargeted from the CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu, created with funding from NSF EIA-0196217) | Free for research and commercial use; credit as stated |
| `public/assets/aegis-pilot.glb` | A Sketchfab character model by Nathang30, given a different face and rigged here | **CC-BY-NC-SA 4.0 — placeholder.** Non-commercial only. The face was changed, but the model is still a derivative of a third-party character model. Replace before any public or monetised release. See `public/assets/aegis-pilot-manifest.json` |
| `public/assets/aegis-operative.glb` | Godot TPS demo robot (previous hero; still the skeleton and animation source) | CC-BY-3.0 |
| `public/assets/titan-sentinel.glb` | See `public/assets/titan-manifest.json` | See manifest |


## Phase 10 cinematic breach and city presentation

Y performs an automatic 3/3/2 missile barrage, opens a collision-verified passage,
flies AEGIS through prepared interiors and triggers a directional exit blast before
restoring normal controls. O/F structural demolition remains separate. The authored
intact city, original character and HUD remain integrated.

See [Phase 10 live evidence](artifacts/phase10/review.html), the
[technical handoff](docs/PHASE10-CODEX-TO-CLAUDE-HANDOFF.md), and
[audit/implementation plan](docs/PHASE10-PLAN.md). Run
`npm.cmd run dev -- --host 127.0.0.1 --port 5192`; normal game:
http://127.0.0.1:5192/. Evidence includes real input recordings, editable Blender/GLB
assets, license attribution and measured quality tiers. Repeated architecture,
prepared interiors and occasional frame outliers remain documented. The prior
[Phase 9 evidence](artifacts/phase9/review.html) is retained as historical reference.
