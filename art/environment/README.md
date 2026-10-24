# Original AEGIS architectural assets

`aegis-environment.blend` is the editable Blender 4.5.14 scene. `build.py` reproduces the building library and its GLB, using the installed Blender Python API. There is no downloaded model or franchise-specific content in the library.

The file opens on `AEGIS | Asset Gallery`, with display instances arranged by module. Editable origin-centred geometry is organized in the `LIBRARY_EXPORT` scene's `Kit | ...` collections, which are marked as Blender assets. Gallery transforms are never exported into runtime GLBs. The UVs are valid reusable trim-atlas charts; the game shader supplies physical texture scale independently of each building's dimensions.

The kit contains normalized near/far financial, art-deco, Gothic, industrial and residential shells; real-scale portals, cornices, roof ventilation/access, water tanks, helipads, spires, lamps, benches, storefronts, signs, containers, cranes, bridge trusses, cars and trees. Vesper Cathedral and Crown Exchange are original real-scale landmarks. The runtime arranges these GLB geometries through instancing; it does not construct the expanded buildings from Three.js primitives. The 16 buildings in the protected old deployment/combat district are preserved from the committed prototype.

Building shell geometry is normalized to a one-unit envelope and gets a deterministic physical width, height and depth in the layout. Roof and street modules are authored in metres. All meshes have UVs and normals. The source contains a shared base-color, normal and packed ORM atlas; the runtime uses physical world-coordinate sampling so instancing does not stretch the paving and masonry texture scale. Near and distant variants live in the same cached GLB.

Focused exports are also included: `aegis-skyline-lod.glb` and `aegis-landmarks.glb`. The full kit is the runtime asset; the two smaller libraries are available for further asset partitioning. The build recalculates outward-facing normals and asserts positive signed volume for every building shell. `node scripts/validate-environment-assets.mjs` verifies all three actual exported GLBs have UVs/normals, finite attributes and positive shell volume, and checks external provenance.

Build from the environment worktree:

```powershell
node scripts/prepare-environment-materials.mjs
& 'C:\Users\XD GAMING\Downloads\Work\Agesis Game\tools\blender-4.5.14-windows-x64\blender.exe' --background --factory-startup --python art/environment/build.py
node scripts/acquire-environment.mjs
```

The executable is read from the installed tool location. The build writes only into this worktree's `art/environment` and `public/assets/environment` directories. It does not open or modify character Blender sources.

Original asset ownership and per-mesh geometry statistics: `public/assets/environment/authored-manifest.json`. Original material atlas provenance: `atlas-manifest.json`. The only acquired environment assets are three 1K CC0 Asphalt 02 maps by Rob Tuytel / Poly Haven, reduced to 512px WebP, with individual source sizes, URLs, download dates and commercial-use status in `external-manifest.json`; license text is `LICENSE-PolyHaven.txt`. No external 3D model was necessary for this implementation.
