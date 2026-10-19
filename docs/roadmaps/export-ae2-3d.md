# AE2 - Advanced Export for 3D Studio

One dialog over the 3D exports that used to be separate commands: GLB, glTF, STL, OBJ and a PNG still. The existing commands, the glTF options and the turntable render are unchanged.

- Command `studio3d.export.advanced` ("Advanced export...") is listed first in the Export center's 3D group. It is enabled once a scene is ready.
- Fields by format: file name (all); glTF textures embedded or as a ZIP, and "selection only" (GLB/glTF); unit (STL/OBJ); custom size and transparent background (PNG still).
- The dialog adds no export logic. It runs the registered commands in order: `studio3d.export.options` (textures, selection), `studio3d.unit.set`, then `studio3d.export.glb` / `.gltf` / `.mesh` or `studio3d.render.still`. The session options (textures, selection-only, unit) are the same ones the panels edit, so they carry over.
- New optional `name` on `studio3d.export.glb`, `.gltf`, `.mesh` and `studio3d.render.still` sets the file stem. Path characters and a known extension are dropped; without it the old names (scene name, `-still`, `-camera`) are unchanged.
- Validation: name required; scene must have content for model formats; selection-only needs a selection; custom still size 1-16384 px per side. The renderer still clamps to what the GPU allows, as before.
- No preview or size line: model size is only known after export. Turntable video stays on its own command.
