# shadcn/tweakcn theme compatibility

Research: 2026-10-14. Somnia baseline: P0/P1 through `b56912c3`, based on live `int/shell` `22fe72d8`.
Scope: a proposed alias/import layer. No component swap, dependency, runtime importer or theme change in this patch.

## Recommendation

We are already close in mechanism: semantic CSS variables feed Tailwind's `@theme inline`, with light/dark overrides.
Keep the components and current bento geometry. Add a bounded shadcn-compatible exchange format and explicit role adapter,
not the shadcn CLI or a second theme engine. Most roles map directly; two conflicts prevent blind CSS pasting:

- shadcn `--accent` is an interactive hover/selection **surface**. Somnia `--accent` is the exact picked **seed**, also an SDK contract.
- shadcn's current radius scale derives from one `--radius`; Somnia already has independent 5/7/11px small radii,
  16px controls, 25px panels and a separately saved 0-25px outer radius.

## Role map

| shadcn role | Somnia source/default | Import target / judgment |
| --- | --- | --- |
| background / foreground | bg-base / text-primary | Direct semantic mapping |
| card / card-foreground | bg-panel / text-primary | Direct; app panel surface, never document paper |
| popover / popover-foreground | bg-elevated / text-primary | Direct floating chrome |
| primary / primary-foreground | accent-fill / action-ink | Action fill/ink, not a new override of saved seed |
| secondary / secondary-foreground | bg-surface / text-secondary | Proposed supporting filled-control roles |
| muted / muted-foreground | bg-hover / text-tertiary | Approximate semantic match; validate text on actual surface |
| accent / accent-foreground | bg-hover / text-primary | Store as `--sc-accent` / `--sc-accent-foreground`; NEVER overwrite root legacy `--accent` |
| destructive | danger | Proposed destructive role; status danger surfaces remain separate |
| border / input | border-default / border-subtle | Input is control border, not blindly bg-surface |
| ring | focus-ring | Safety role; high contrast wins over imported choice |
| sidebar / sidebar-foreground | bg-panel / text-primary | Existing sidebar chrome, no studio-local writes to root |
| sidebar-primary, accent, border, ring + foreground pairs | corresponding global action/hover/border/focus roles | Initially aliases; independent sidebar styling needs later review |
| radius | r-lg (11px) | Export compatibility base; imports do not rescale existing radii |
| chart-1..5 | no complete current app-token contract | Retain in exchange metadata, do not recolor chart/document content |
| font-sans / mono, shadows, spacing, tracking | existing ui-font/mono/shadow/gap | Out of the first color-only import item; requires separate review |

Nonconflicting root aliases can expose `--background`, `--foreground`, `--card`, `--primary`, `--ring`, `--radius`, etc.
Use namespaced `--sc-*` as the complete exchange-facing map, with a bounded translator back into current Somnia roles.
Do not claim drop-in rendering of arbitrary shadcn components while the accent collision exists.
Export actual shadcn names in a standalone theme file/registry object; import `accent` into the namespaced map.
Avoid circular aliases: one direction at a time, not `primary -> accent-fill -> primary`.
Keep current `--color-accent`, radius-sm/md/lg and all existing utility names unchanged.

## Import contract (proposed)

Accept a local JSON object with `cssVars.light`, `cssVars.dark` and an allowlisted `cssVars.theme`, as the official registry examples use.
The fetched tweakcn Amethyst Haze sample is `registry:style`, not `registry:theme`, and includes body CSS.
Accept either type **as theme data only**. Do not process `files`, `dependencies`, `registryDependencies`, `css`, imports or scripts.
No command runs, network font downloads, provider access or `shadcn add` step.

For pasted CSS, parse only variable declarations inside exact `:root` and `.dark` blocks into the same validated schema.
Never inject the text as a stylesheet. Reject other selectors/at-rules except an explicitly recognized inert export scaffold;
report unsupported declarations rather than silently calling the import complete.
Limit size/token count/value length. Reject duplicate keys, prototype keys, unknown variables, URLs, `@import`, expressions and references
outside the allowlist. First pass accepts bounded full color literals (hex/rgb/hsl/oklch), not unrestricted CSS values.
Old Tailwind-v3 HSL channel triplets need a separately recognized adapter, not accidental parsing as full CSS colors.

Preview both schemes before Apply; label ignored metadata. Store normalized requested theme values and source/attribution,
not raw executable CSS or adjusted high-contrast output. Apply atomically, remove stale overrides on reset, retain last valid theme on failure.
Resolve native control scheme through the current `data-theme` model; `.dark` is an exchange selector, not a replacement for saved theme IDs.
Custom accent precedence is explicit: a picked custom accent remains an action override; Reset restores imported theme action roles.
Accessibility overrides run last. Do not promise contrast from a preset name: validate real ink/surface/focus pairs and report unsafe values.
SDK stays the existing four variables. No chart, syntax, canvas document color, export or native material changes.

## Small roadmap item: P1.T0 theme-exchange adapter

First implement a pure, dependency-free parser/validator plus role mapping and color-only export round trip, with synthetic fixtures.
Then add nonconflicting additive aliases in an isolated gallery. No app settings UI or theme application yet.

Acceptance:

1. Default exported aliases resolve to current computed colors in light/dark/high contrast; no component/snapshot change.
2. One actual tweakcn registry sample round-trips recognized roles; reports its body tracking/font/shadow fields as unsupported.
3. Malicious CSS/registry side effects, unknown roles, duplicate keys and over-limit inputs are rejected; no external requests.
4. `accent` collision stays namespaced, legacy exact-value extension tests pass unchanged, and independent radius values stay byte-identical.
5. Parser tests and computed-style proof run without WASM. App theme Apply/Undo/Reset/OS changes remain a later item after app baselines.

This is the smallest useful first item. The user-facing importer is P1.T1, after a reviewed preview and persistence contract.
No time estimate is claimed from this research. P3 remains unstarted.

## Licenses and evidence

Verified current primary pages, 2026-10-14:

- shadcn/ui is MIT: retain its copyright/license notice if substantial code is copied. No new upstream code is copied by this concept.
  https://github.com/shadcn-ui/ui/blob/main/LICENSE.md
- tweakcn itself is **Apache-2.0, not MIT**. If its generator/code/assets are copied, preserve license/required notices and mark changes as required.
  Using an independently written data adapter does not require embedding its application. No blanket license claim for every third-party preset.
  https://github.com/jnsahaj/tweakcn/blob/main/LICENSE
- Official roles, CSS pairs, `.dark`, current radius multipliers and Tailwind bridge:
  https://ui.shadcn.com/docs/theming
- Official registry examples and schema, including theme data alongside potentially executable integration content:
  https://ui.shadcn.com/docs/registry/examples
  https://ui.shadcn.com/docs/registry/registry-item-json
- Primary tweakcn project and inspected live registry sample:
  https://github.com/jnsahaj/tweakcn
  https://tweakcn.com/r/themes/amethyst-haze.json

Evidence limits: one fetched preset proves that sample's structure, not every tweakcn export. No importer or UI was built in this concept patch.
Current theme safety remains the bounded P0 fix; this proposal is not an accessibility certification or permission claim.
