# Animation document inside `.somnia` (proposal)

Status: merged on int/beta5 (pre-release line). The schema and studio described here are implemented in the Animation Studio; the studio still claims no file extension.

## Goal

Save and reopen an Animation project as a document kind inside the `.somnia` container, without registering `.somnia` globally to Animation and without claiming `.aep`.

## Proposed container entries

| Entry | Content | Notes |
| --- | --- | --- |
| `animation/document.json` | The `AnimationDocument` as the studio holds it today: `schema`, `engine`, `id`, `name`, `revision`, `activeComp`, `compositions[]`, `assets[]` | Strict validation on open (`validateDocument`). Unknown `schema` is rejected, never guessed. |
| `animation/view.json` | Playhead, selection, zoom, open property rows, graph mode, loop flag | Optional and disposable. Never part of the revision. |
| `animation/assets/<id>/<name>` | Imported media, once assets exist | Referenced by id from `assets[]` with fingerprint and relative path. Empty in P1. |
| `animation/exports.json` | Last export settings (transparent flag, work area) | Optional. |

The container manifest names the document kind `animation` and the entry path. The exact manifest field belongs to the `.somnia` owner.

## Schema facts already fixed by the code

- Time is integer ticks, 240000 per second. Frame rate is a rational. `workArea` is `{in, out}` in ticks with `out` exclusive.
- Keyframe: `t`, `v`, `interp` (`hold`, `linear`, `bezier`), temporal ease `out` and `in` as `[x, y]` with x in 0..1, optional spatial tangents `sIn` and `sOut` (vec2 offsets, position keys).
- Properties are typed (`scalar`, `vec2`) and carry units and ranges in the schema, not in UI labels.

## Versioning

- `schema` stays 1 while changes are additive and optional (tangents were added this way). A breaking change bumps `schema` and needs a migration function plus a refusal for newer files.
- `engine` records the writer. It informs, it does not gate.

## Save semantics

- Atomic write through the existing save path (temp file, fsync, rename, expected revision compare).
- Recovery journal stays separate from the file and is cleared on a successful save.

## Open questions for Philipp

1. Single `.somnia` file per animation, or a project folder with the container inside?
2. Should assets be embedded by default or linked with relink information?
3. File association: only through "Open with Somnia" for `.somnia` and a smart-open rule that routes by the document kind entry?
4. Should exported PNG sequences be remembered in the document (`exports.json`)?
