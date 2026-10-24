# Cinematic corridor source

Open `cinematic-corridors.blend` in Blender 4.5. Four asset-browser collections contain the office, damaged stone vault, industrial utility passage and entrance canopy. The office is visible initially; enable another collection to inspect it. Each prototype uses metre coordinates and is aligned at the origin for runtime instancing. The source is supplemental architecture; supplied complete building models remain intact outside the actual damaged components.

Regenerate from the project root:

```powershell
& 'tools/blender-4.5.14-windows-x64/blender.exe' --background --factory-startup --python art/environment/phase10/build_cinematic_kit.py
node scripts/phase10-optimize-kit.mjs
node scripts/phase10-audit.mjs
```

The authoring script exports all modules before hiding alternate viewport collections. Optimization preserves UVs and normals for the existing shared PBR atlases. Runtime detail is instanced only along nearby actual breach corridors; no complete furnished interior is loaded per building. Provenance: `public/assets/environment/metropolis/PHASE10-LICENSES.txt`.

The three additive character clips are separately inspectable in `art/animation/phase10/titan-breach-clips.json`. They use the existing mixer and skeleton without modifying the original character GLB, Blender source, controller or base clips.
