# Component props and slots

Draft slice: `comp/props-slots`, based on PR #109 (`feature/component-system`). No release or merge in this slice.

## Using it

1. Select a source element. In Components, expand **Expose a prop or slot**.
2. Give it a name and choose Text, Link URL, Image URL or Slot (HTML). Click **Expose selected element**. This is a source edit and supports Undo.
3. Select the containing block and save it as a component. Expose the same names and types in each variant before saving that variant.
4. Insert a marked instance, select its root, then use **Instance props and slots**. Apply changes independently; Reset uses the current variant's default. Changing one instance does not change library templates or other instances.
5. Switch variants. Field values follow names, not element positions. Fields absent from a variant stay in metadata and come back when switching to a variant that has them.

Bindings can also be written directly in source:

```html
<article>
  <h2 data-somnia-prop-text="title">Default title</h2>
  <a data-somnia-prop-link="cta" href="/start">Go</a>
  <img data-somnia-prop-image="photo" src="photo.png" alt="Photo">
  <div data-somnia-slot="body"><p>Default content</p></div>
</article>
```

Text is plain text and is escaped, not treated as HTML. Link fields change `href` on anchors. Image fields change `src` on images (alt remains regular source). Slot values are author-supplied HTML, like code editor edits; they are not an untrusted-content sanitizer. Use balanced HTML inside the slot. Nested or duplicate field bindings are refused. Names start with a letter and accept letters, numbers, hyphens and underscores, up to 60 characters.

## Files and integration

- `componentProps.ts`: parse5 source-location based field discovery and targeted patches; no DOM, storage or editor coupling.
- `ComponentPropsPanel.tsx`: field binding and instance form.
- `componentActions.ts`: field exposure, apply/reset and variant-switch wiring. Each apply/switch uses one source transaction. The core reserves `data-somnia-*` attributes, so field exposure uses validated source replacement instead of weakening the core attribute guard.
- `ComponentSystemPanel.tsx`: two small integration points. Existing library/variant controls stay intact.
- `componentSystem.ts`: saved copies strip root `data-somnia-overrides` alongside root component/variant marks. Field bindings stay in templates.
- `parse5` is now a direct app dependency, the same version used by editor-core. Its source offsets preserve unrelated HTML formatting instead of reserializing a whole block.

## Persistence and switch rules

`data-somnia-overrides` on the instance root stores URI-encoded JSON with typed keys (`text:title`, `slot:body`, etc.). Source save/reload carries the metadata; no new storage schema is needed. Existing v2 libraries remain valid. The current variant is the baseline for discovering direct code/canvas changes to exposed fields.

- No override: use the new variant's default.
- Explicit override, including empty or equal-to-default values: carry it.
- Absent field: keep its override in metadata.
- Reset: remove its explicit override and use the current variant's default.
- Different component via Replace selection: use the new component defaults; do not mix unrelated overrides.
- Missing original variant or damaged override metadata: refuse switching rather than silently losing data.
- Marker checkbox off: current values still transfer for that switch but component identity/metadata is removed. Later automatic instance switching is unavailable, as in the base feature.

Checks include duplicate source IDs after applying slot HTML, malformed/nested fields, 100 KB content/metadata limits and executable URL schemes. URLs allow relative/http/https, plus mailto/tel for links. Data/blob/custom schemes are intentionally not accepted by this field form; source editing remains available.

## Validation

- Unit tests cover field discovery, text/attribute escaping, metadata round trip, variant structure changes, missing fields, explicit equal-to-default overrides, code edits, reset semantics, bad fields/URLs/slot boundaries, size limits, quoted tags and transaction Undo/Redo.
- Playwright covers all four field types, variant switch, one-step Undo, reset, session reload, field exposure and refusal of executable URLs/duplicate IDs. Existing three component-library browser tests also run unchanged.
- Light theme screenshots of the actual instance form and full editor were inspected. The field form fits the narrow Components panel and wraps its buttons. URLs/images are stripped from the design preview by its existing sandbox policy, so browser tests verify their source and form values, not the stripped preview attributes.

## Remaining limits / Windows checklist

Only named fields survive a variant switch; arbitrary unbound structural/style edits still follow the base replacement behavior. No template edit/publish lifecycle or cross-project library sync was added. Image picking/alt props and nested field bindings are not part of this slice. The existing Inspector prints raw root metadata in its attribute list; hiding reserved bookkeeping there is a later UI cleanup, outside this slice.

On Windows: expose fields on a card, save two variants with the same names, insert two copies, change all four fields on one copy and confirm the other copy is unchanged. Switch back and forth; test a variant without one field; use Ctrl+Z after switch/apply; Reset a field; save/close/reopen and switch again. Try a slot containing an existing source ID and confirm refusal. Actual desktop save/open/close and Windows input have not been tested here.
