# Phase 10 final checkpoint

Functional implementation and live verification are complete. See review.html, verification.json and docs/PHASE10-CODEX-TO-CLAUDE-HANDOFF.md for delivered behavior and art limitations.

- Main-game Y: actual 3/3/2 missiles, source-geometry damage, enabled capsule traversal, authored interiors, additive camera/poses, directional exit and restored controls. O/F collapse and persistent ruins retained.
- Final: 85 offline tests, TypeScript, production build, 56 browser regressions, four production tiers, eight real-input Y videos and one O/F demolition video pass.
- Unrecorded rainy-night Y: LOW 121.3 FPS, MEDIUM 76.7, HIGH 60.1, ULTRA 59.5. MEDIUM p99 27.8 ms, worst 48.6 ms. Simultaneous collapse/breach 74.4 FPS, worst 69.5 ms. Desktop applications share GPU; no controlled percentage-speed claim.
- Initial overlap near-corner aim clipped a neighbouring saved footprint. Safe rejection retained in weapons-rejected-corner-aim/. Centre aim passes in weapons-overlap-centre/ without relocation or resource injection. Final results link both. Original stages retained in final-stages-first-attempt.json.
- Final build/tests include preparation timeout and exact family-kit guards. Production rerun against that build. No runtime source changed afterward.
- Twelve protected sources and fifteen supplied originals remain hash-identical to captured working baseline. Uncommitted user work preserved. No commit, push, deployment or publication.
- Blender source, raw/optimized GLBs and licenses saved. New original kit: four modules, 8,684 triangles, 229,480 bytes compressed; decoded UV/normal/index checks pass.
- Six before/after architecture pairs visually reviewed. Report browser check: 263 local links, 75 decoded images, nine 1280 x 720 videos and actual seek/playback pass. Silent videos. Industrial photograph retains hidden hero's separate thruster bloom at right edge.
- Remaining art limits: repeated architecture/prepared corridors, broad avenues, simplified street life, grouped collapse, approximate reflections and frame outliers. Nearby sequences 7-9 s, long rooftop around 14 s. No AAA visual completion or zero-stutter claim.
- Emulator left untouched; not listed in final allocation snapshots. Do not infer current emulator VRAM from earlier observations.
- Vite5192 and production preview5194 remain available. After profiling, phase10-open-game.mjs opens isolated visible normal MEDIUM game; open-game.json records verification. Ordinary URL has no mutable QA hooks.
