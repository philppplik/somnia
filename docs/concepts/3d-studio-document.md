# 3D scene document (.som3d)

Status: implemented in format version 1 (branch `feat/3d-studio-p0`). Companion to `3d-studio.md`.

## Goals

1. Save and reopen a 3D Studio scene without losing what the user built: objects, materials, lights, cameras, units, environment, snapping, view.
2. Stay readable by other tools. The geometry is a standard GLB, so any glTF viewer can open it.
3. Be versioned from day one, fail with a readable message, never crash on a damaged file.
4. No new dependencies, no network, no code in the file.

## Shape

A `.som3d` file is JSON:

```json
{
  "format": "somnia-3d",
  "version": 1,
  "app": "somnia",
  "unit": "mm",
  "env": {"preset":"sky","intensity":1,"rotation":0,"background":false,"customName":""},
  "snap": {"on":false,"move":0.25,"rotate":15,"scale":0.1},
  "view": {"position":[4,3,5],"target":[0,0.5,0],"fov":45},
  "extras": [{"i":0,"shadow":true}, {"i":3,"area":{"...":"..."}}],
  "scene": {"encoding":"base64","data":"..."}
}
```

`scene` is either the GLB embedded as base64 (default, one file, works with drag and drop and Smart Open) or `{"uri":"name.scene.glb"}`, a sidecar next to the document ("Save with separate GLB"). A sidecar reference must be a plain file name: no folders, no `..`, no URL schemes. To reopen, the user selects both files, the same way a `.gltf` is opened with its `.bin`.

## What lives where

| Data | Where | Why |
|---|---|---|
| Hierarchy, names, transforms, meshes, PBR materials, textures, directional/point/spot lights, cameras | GLB | Standard, portable |
| Shadow flags, area lights | `extras`, by depth-first node index | glTF has no shadow flag and no area light. The GLB holds an empty node at the area light's place. |
| Unit for STL/OBJ export | `unit` | glTF is always metres |
| Environment preset, intensity, rotation, background | `env` | Not part of glTF |
| Custom HDR/EXR | Name only (`customName`) by default. With "Save with HDR inside" (`embedEnv`), `envMap {name,encoding:"base64",data}` | Maps are large. Embedding is optional and limited to 16 MB decoded (`MAX_EMBED_ENV_BYTES`); the file must be .hdr or .exr. Without an embedded map, opening uses the studio lighting and tells the user which file to open again. |
| Snapping, saved view | `snap`, `view` | Tool state worth keeping |

Node index: pre-order walk of the scene's top-level nodes, counting every node. The writer exports the top-level nodes directly (no wrapper), so indices match after load and the scene does not gain a level per save.

## Versioning

- `version` is an integer. Readers refuse a newer version with "saved by a newer version of Somnia".
- Each format change adds one migration `N -> N+1` in `MIGRATIONS`; opening an older file runs them in order. A missing step is a readable error.
- Unknown top-level fields are ignored on read. Anything that changes meaning needs a version bump.
- Version 1 has no migrations yet. The mechanism is covered by tests with injected migrations.

## Validation (reader)

Every field is checked: finite numbers, enum values, ranges (fov 1 to 120, light sizes, snap steps), unique node indices, at most 100,000 extras, base64 charset and length, sidecar name shape. Errors name the problem in plain words. A node entry that no longer fits the loaded tree (wrong kind, index out of range) is skipped and a notice says some light settings could not be restored.

## Known limits (v1)

- Custom HDR maps are embedded only on request and only up to 16 MB; a bigger map stays a separate file.
- Recent scenes and autosave live in this browser (IndexedDB), not in the document: at most 6 saved scenes plus one autosave slot, 48 MB per scene, 160 MB in total. Stored copies always embed the geometry.
- Animations and skins are whatever the GLB exporter writes.
- Cameras other than perspective, and per-light shadow tuning beyond on/off, are not stored.
- Objects hidden in the scene are saved (exporter option `onlyVisible:false`).
- STL/OBJ/PLY imported shapes are saved as meshes in the GLB, not as the original files.

## Code map

- `lib/studio3d/document.ts`: format, validation, migration, base64, sidecar lookup (pure, tests in `document.test.ts`).
- `lib/studio3d/stage.ts`: `collectNodeExtras`, `applyNodeExtras`, `loadMany`.
- `components/studio3d/Viewport3D.tsx`: `saveDocument`, `.som3d` branch of open.
- Commands: `studio3d.save {sidecar?}`; opening is the normal Open / Smart Open path (`.som3d` is a `model3d` file).
