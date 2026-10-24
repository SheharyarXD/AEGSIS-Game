> Phase 6.5: this file records the original isolated Phase 6 delivery/plan. The world has since been integrated into the dirty MAIN checkout with a verified backup and semantic bootstrap merge, as explicitly authorized by the user. Current results and continuation instructions are in [PHASE6-CODEX-TO-CLAUDE-HANDOFF.md](PHASE6-CODEX-TO-CLAUDE-HANDOFF.md). Do not apply the historical cherry-pick steps to the current dirty main tree.

# Integrating the environment with Claude's character/HUD work

The source checkout `../Agesis Game` remains on its own branch and has not been edited, reset, cleaned, stashed, merged or committed by this environment effort. The environment worktree is `../Agesis-Environment`, branch `feature/aegis-cinematic-open-world`, based on `784838c`. The upgraded character's uncommitted assets and code are deliberately absent here; preview media uses the committed hero.

Integrate only after Claude has finished and committed its changes. Do not run a merge against the active dirty checkout. The environment modules/assets and the bootstrap changes are kept in separate commits so shared bootstrap code can be integrated explicitly.

Environment modules/assets commit: `0cba83dd429f82812c3de20ff05837f1b6b2851b`. The following bootstrap commit is the tip of `feature/aegis-cinematic-open-world`; its `src/main.ts` diff should be reviewed and spliced into the upgraded hero's bootstrap.

1. From the completed character branch, create an integration branch, preserving its latest committed work:

   ```powershell
   git switch -c integration/aegis-open-world
   git log --oneline 784838c..feature/aegis-cinematic-open-world
   ```

2. Cherry-pick the commit titled `Add authored city, atmosphere, weather and environment validation`. This adds/replaces only the environment boundary, its assets, scripts, tests and documentation; it does not replace `src/main.ts`, player, camera, physics, audio, combat or HUD implementations. If another agent has since edited world files or package scripts, resolve those specific changes explicitly.

   ```powershell
   git cherry-pick 0cba83dd429f82812c3de20ff05837f1b6b2851b
   ```

3. Apply the bootstrap insertions below into Claude's current `src/main.ts`. Preserve its `player.root`, armour/pilot forms, assembly callbacks, render interpolation, weapons, targeting and HUD code. Do not replace the file with this branch's version. `docs/ENVIRONMENT-BOOTSTRAP.patch` records the exact diff against the committed base and is useful for review; its context may fail against the upgraded hero.

   Import:

   ```ts
   import { installEnvironmentDebug } from './world/environment/EnvironmentDebug';
   ```

   Immediately after constructing `city`, `camera` and `player`, before animation starts:

   ```ts
   await city.ready;
   camera.camera.far = 6500;
   camera.camera.updateProjectionMatrix();
   installEnvironmentDebug(city, renderer, point => {
     player.ragdoll.reset();
     player.body.setEnabled(true);
     player.body.teleport(point);
     player.velocity.set(0, 0, 0);
     camera.reset(point);
   });
   ```

   Add `city.reset()` after `player.reset()` in the game's restart/reset function. Extend the existing audio toggle with `city.audio.enabled = enabled`. Replace the existing `city.update(player.position, time)` call with:

   ```ts
   city.update(player.position, time, camera.camera, player.velocity, mode === 'play');
   ```

   Once per frame, including while paused, call:

   ```ts
   city.setActive(mode === 'play');
   ```

   The final call mutes environmental audio during menus/pause; the existing hero audio remains independent. `City.update` remains backward-compatible with two arguments, but passing camera/velocity gives correct precipitation placement and flight prefetch. The `City` exports `SPAWN`, `COURT`, `COURSE`, `courseRings`, `sun`, `hangarLights` and `setAssemblyLight` remain compatible with the committed game.

4. Validate the actual combined character/environment build:

   ```powershell
   npm.cmd run build
   npm.cmd test
   npm.cmd run test:environment
   npm.cmd run test:environment:browser
   npm.cmd run dev -- --host 127.0.0.1 --port 5186 --strictPort
   ```

   Open `http://127.0.0.1:5186/?envDebug=1`. Deploy/skip the intro, visit all five districts, take off, boost through a main avenue, land on a roof and bridge, cut thrusters into free fall with the upgraded hero, transform and use its weapons. Repeat in rain and snow, and on LOW. The environment branch's tests verify the committed hero; the combined uncommitted character upgrade cannot be claimed verified in advance.

No automatic merge has been performed. Original character, animation, weapons, targeting, tactical HUD, camera, physics and audio files are not part of the environment commits. Generated legacy browser screenshots/performance artifacts in the isolated worktree are also excluded from integration; the new evidence is under `artifacts/environment/`.
