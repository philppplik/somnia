# Local AI for Interface, Animation and 3D: concept and pure first slice

## Existing boundary

LocalStudioAssistant/localStudioAdapter already support narrow local suggestions:
Interface stages selected-frame annotation/selected-image alt text, Animation changes selected-layer name,
and 3D stores an annotation in session context, not geometry. Captured baseline and
selection guards prevent stale acceptance; explicit accept/reject/undo remain host
actions. The current assistant has no general model-driven command execution.
Builders own studio UI; this slice changes no studio UI, command registry or adapter.

## Candidate actions and safe destinations

- Interface: suggest a short name for explicitly selected layers. Builder pins IDs,
  original names and revision; shows exact before/after. User acceptance uses existing
  layer rename command semantics. Model receives labels/type hints only, not the
  entire canvas, source files, images or network data.
- Animation: suggest easing and explain it in plain text. First slice is a read-only
  explanation. Future proposal must validate a finite allowlist or bounded curve
  values and pin track/keyframe/time/revision before existing command execution.
  A prose suggestion is not a command ID, timeline rewrite or permission.
- 3D: describe explicitly selected scene metadata as text. First slice is a copyable
  draft/session annotation, never geometry/material/script/export or saved asset.
  Mesh data, textures, URLs and binary scene content are excluded. If a host later
  stores a note, show review and make clear it is not part of exported geometry.

## Pure helper and future builder wiring

Use the AH pattern: a pure builder accepts fixed kind/action plus explicit bounded
text entries only. Strict fields reject credential/config/URL/tool/history additions;
selection content is labelled untrusted data, never authorization. No reads, state,
provider calls, command lookup, effects or user model selection occur here.
Output is a short plain-text draft with a fixed cap. Model output never supplies
its own target IDs or command destination. User acceptance remains separate.

Builders adapt captured selection to existing command surfaces with identity/revision
checks, visible before/after review, allowlisted argument validation and undo. Reject
stale targets; do not silently retarget a selection. 3D descriptive prose and easing
explanations remain read-only until a separately reviewed safe adapter exists.
Run through existing exact local provider checks and source exclusion/consent rules;
no hidden document context, history, credentials or cloud fallback.

Secret text deliberately included in selected prose cannot be automatically detected
by this helper. Explicit text-only shape prevents accidental credential/config
collection; it does not promise secrecy of arbitrary input. Model prompt wording is
defense in depth, not an enforcement boundary. Host scopes and proposal review own
that boundary. No full-studio readiness, real model quality or packaged E2E claim.

## Slice evidence and roadmap

Two pure tests and 451 broad Agent/provider tests pass. Fixed kind/action pairing,
60-entry/2 KiB-entry/8 KiB-total UTF-8 selection caps, unknown/credential/asset fields,
injected instructions-as-data and draft-only contract covered. Output budget is
384 tokens requested by a future host, not model quality or enforcement proof.
Unfiltered tsc still has only inherited missing generated slides-engine/pkg/somnia_slides.js.
DS and layers pass (1661/5961), with existing compiler/ignored/stale-baseline caveats.
No provider call, actual proposal, canvas capture, command execution or studio UI
edit occurs in this slice. Native/real-model/full-studio E2E remains open.

Roadmap-Delta: builders implement exact selection capture and reviewed adapters;
layer rename/easing edits need separate argument/destination validation and undo
acceptance. Current Interface path is annotation/alt text, not automatic naming.
