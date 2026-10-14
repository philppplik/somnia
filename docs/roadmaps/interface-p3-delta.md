# Interface P3 delta: local media snapshots and basic vector shapes

Base P2 `fcf11c6b`. Explicit frame import/drop only; standalone SVG/image Smart Open routing remains unchanged.

- Local PNG/JPEG signature, header, byte and pre-decode dimensions checks (1 MB, 4096px, 4 MP). Browser decode canonicalizes to bounded embedded PNG, strips source metadata and computes SHA-256 identity. Asset provenance records source name/type and unverified user-provided license. Content hashes deduplicate current imports; snapshot metadata is not a signature/authenticity claim.
- Embedded-asset budgets, allowlisted PNG data URLs and metadata/header consistency validation. References validate before replacing a working document. Imports reject changed source revision; one transaction contains asset and layers. Recovery/snapshot budgets remain 5 MB overall, 3 MB embedded data, at most 50 assets.
- Frame-local Import into frame, Set image fill and drop. Cover/contain controls. Instance structure needs detach. No remote fetch, hidden network or global file association change.
- Strict independent SVG snapshot conversion using existing parse5: solid rectangles/circles/ellipses, lines, polygons/polylines and absolute M/L/Z paths. Matching zero-origin viewBox, bounded bytes/count/depth/geometry/points. No raw SVG inserted. Scripts, links, external assets, CSS, transforms, gradients, entities, foreignObject, text and curves are rejected. Conversion warning says source edits do not refresh the snapshot.
- Native ellipse/line/basic normalized-point path shapes and strokes. Canvas click-to-add pen preview with Finish/Cancel/Escape, bounded points and numeric point alternatives. No booleans or Bézier editing. Preview is not a document transaction; commit is one undo step.
- SVG/PNG output includes current structured vectors and canonical embedded images, local clipping and warnings. Handoff includes vector/image references and asset metadata, not embedded image bytes.
- Five-locale import/vector copy and CI-only import/pen acceptance suite.

Verification: 228 focused Interface/studio/routing/shell/render tests passed before final header tightening, then rechecked in final handoff. Command inventory/locale and command-manifest checks pass. Typecheck remains blocked only by pre-existing generated Slides module. App E2E deliberately not run locally. No Cargo/WASM or dependency adoption.

Actual isolated media/vector pixels and generated PNG inspected. Fixed preview-fixture frame overlap after inspection; final scene and PNG re-inspected. Full shell/Agent/native/production CI gates remain. Raster decoding is browser-backed, supported only within the preflight caps; malformed decoding remains an error. SVG subset rejection is intentional, not fidelity. Hug text remains approximate with diagnostics. Asset source/license metadata is not redistribution permission. No release/push/spending, global CSS/token change, SDK/AI/network permission or FigCraft import.
