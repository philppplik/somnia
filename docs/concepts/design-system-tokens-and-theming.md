# Design system: tokens, themes and studio boundaries

Status: research proposal only, 2026-10-14. No implementation, test changes or push.
Baseline: `int/shell`, `315d1f23a061d07215bdc60d25d3d57d756cbaab`, verified live.
Scope: token contracts, theming, contrast and studio/extension integration. Component inventory and interaction contracts are separate work.

## 1. Decision and verified baseline

Keep the existing CSS-variable/Tailwind bridge. Put a typed, versioned token graph and one appearance resolver behind it. Components consume semantic roles, studios contribute domain roles, and arbitrary accents remain user intent rather than arbitrary text/focus colors. Preserve bento geometry, saved IDs, document colors, sandbox boundaries and all tests.

Paths below are relative to `phase1/`, unless marked root.

| Inspected source | Current behavior | Risk / implication |
| --- | --- | --- |
| `src/styles/tokens.css` | Base light/dark variables, palette overrides, 5/7/11/16/25px radii, 6px shell gap | Foundation already exists. No second token system. |
| `src/styles/global.css` | Tailwind `@theme inline` bridge, high-contrast selectors and global reduced-motion rule | Keep existing utility names during migration. |
| `src/lib/theme.ts` | Stable named IDs, explicit modes/palettes, system OS resolution | `cream` stays Coffee Shop; `green` stays Forest Green. |
| `src/lib/look.ts` | Inline custom `--accent`, soft and ink, but not fill; density only changes gap 3/6/10px; UI zoom 85-130% | Accent/fill can disagree. Inline accent can outrank high-contrast CSS. |
| `src/lib/uiPrefs.ts` | Separate UI font, size, motion and shadows; defaults 13px, 120ms | One resolver, not necessarily one storage object. |
| `src/lib/glass.ts` | Contrast composites code background over neutral #808080 | Reference estimate, not guarantee over arbitrary backdrops. |
| `src/components/Settings.tsx` | Accent contrast against fixed base backgrounds; extension swatch copies current mode's hex | No whole-theme audit; no live palette selection identity. |
| `src/components/ui/button.tsx` | Base UI + cva + Somnia tokens; primary has fill and white ink | Ink must be resolved against the actual fill. |
| `src/lib/extensions/manifest.ts`, `host.ts` | Namespaced declarative accentPalettes, light/dark hex; narrow syntax-theme variable allowlist | Keep data-only contributions, not unrestricted CSS. |
| `src/lib/extensions/panelHtml.ts` | Isolated frame gets initial sanitized scheme/text/secondary/accent/border | Root variables do not inherit; future live updates need an explicit contract. |
| `src/lib/studios/index.ts`, `registry.ts` | Ten registrations including Vibe Space; optional shellV2 | Use registry entries, not historical nine-studio assumptions. |
| `tests/themes.spec.ts`, `tests/extension-accent-palettes.spec.ts` | System mode, persistence, 25px dialogs, exact selected hex, malformed palette rejection | Compatibility gates, not accessibility certification. |

Only source/test inspection was performed. No desktop, screenshots, font loading, native material, test execution or compliance was verified. Older concept documents do not prove implementation status.

## 2. Token graph and catalog

Three layers:

1. Primitive: private palette stops, dimensions, weights, opacity, durations and easing.
2. Semantic: stable public roles such as `surface.panel`, `text.secondary`, `action.fill`, `action.ink`, `focus.ring`, `radius.dialog`.
3. Domain/component aliases: `studio.sound.waveform`, `studio.sheets.selection`, `button.primary.background`. Alias semantic roles unless meaning really differs; cannot override global safety roles.

Proposed location: `src/design-system/tokens/`, with primitive/semantic JSON, named-theme and density sets, schema version and contrast-pair registry. Proposed compiler: `scripts/design-system/compile-tokens.mjs`. These are proposed paths, not existing files.

Use a bounded DTCG 2025.10 format subset (`$type`, `$value`, aliases, `$description`) for exchange. It is a Community Group report, not a W3C Recommendation. Start with sRGB output, no full resolver runtime, Figma service or Rust/WASM requirement.

Illustrative valid source shape, not app implementation:

```json
{
  "primitive": {
    "gap": { "$type": "dimension", "$value": { "value": 6, "unit": "px" } },
    "indigo": { "$type": "color", "$value": { "colorSpace": "srgb", "components": [0.31, 0.27, 0.90] } }
  },
  "semantic": {
    "shellGap": { "$type": "dimension", "$value": "{primitive.gap}" },
    "actionFill": { "$type": "color", "$value": "{primitive.indigo}" }
  }
}
```

Generate checked-in CSS, typed role names and temporary legacy aliases. Fail on unresolved references, cycles, wrong types, unsupported units, duplicate IDs or unknown public roles. CI checks deterministic output. Never concatenate extension-controlled CSS properties, selectors, URLs or scripts.

| Family | Proposed roles/values | Policy |
| --- | --- | --- |
| Surfaces | shell/base/panel/elevated/control/hover/canvas/backdrop | Chrome is separate from document paper and media. |
| Text | primary/secondary/tertiary/placeholder/disabled/onAction/link | Usable hints and tertiary labels still pass contrast. |
| Border | decorative/control/divider/selected | Decorative borders are not control-identification borders. |
| Action | seed/text/fill/ink/hoverFill/pressedFill/softSurface/softInk | Seed is identity; safety roles resolve independently. |
| Status | success/warning/danger/info with ink/icon/surface | Never replaced by accent; include non-color cues. |
| Focus | ring/halo/width/offset | Safe ring separate from seed; 2px baseline, 3px high contrast proposed. |
| Spacing | 0/2/3/4/6/8/10/12/16/20/24/32px | Retain intentional 3/6/10 density gaps. |
| Radius | 5/7/11/16px; panel/dialog 25px | Saved outer radius 0-25px remains separate; audit current panel coupling. |
| Typography | UI 13px/1.45 baseline, saved 10-20px UI size | Inherit or scale component type; avoid fixed tiny labels. |
| Editor/numbers | Mono and tabular UI roles; editor 10-22px, line height 1.2-2 | Independent of UI density and document formatting. |
| Motion | 0/80/120/180ms, out/in-out easing | Proposed scale; reduced mode stops nonessential motion. |
| Material | solid/glass by scope; shadow none/subtle/standard | Safety can resolve to opaque while saving intent. |

Proposed control heights compact/normal/comfortable: 28/36/40px; dense rows 24/28/32px. These require visual review before changing defaults. Density changes padding, gaps, rows and icon framing, not editor font, content pixels, timeline mapping or canvas zoom. Version token schema separately from app and extension API; never reuse a deprecated role for a new meaning.

## 3. One resolver, explicit precedence

Proposed pure API: `resolveAppearance(preferences, environment, enabledPaletteRegistry)` returns `{version, revision, scheme, cssVariables, panelSnapshot, adjustments}`.

1. Sanitize legacy preferences without deleting unknown stored intent.
2. Resolve OS mode for system, or named theme mode.
3. Load complete semantic base and named overrides; resolve aliases.
4. Apply allowed user accent, type, density, radius and material intent.
5. Derive accent/action/selection roles against actual resolved surfaces.
6. Apply high contrast, forced colors, reduced motion and reduced transparency; these outrank palette and material. Revalidate pairs.
7. Atomically replace a complete map, removing stale variables.
8. Notify native material, CodeMirror UI and extension panels from the same immutable revision.

One controller handles preference and OS media changes, boots before visible paint, and replaces existing independent writers only after equivalence tests. `theme.ts`, `look.ts`, `uiPrefs.ts` become adapters. Keep `data-theme`, `data-palette` and Tailwind bridge during migration. Set `color-scheme` for native controls/scrollbars. Portals use the global map; studio-local roles cannot break portalled menu focus.

Save requested settings, not adjusted results or OS state. If storage fails, retain session behavior and honest persistence notice. On resolver failure keep last valid map, or bundled base at startup; diagnostics do not become canvas clutter.

Safety rules:

- Forced colors uses system colors (`Canvas`, `CanvasText`, `ButtonFace`, `ButtonText`, `Highlight`, `HighlightText`) and real outlines/borders, not shadows alone.
- High contrast has complete audited maps, not partial overrides over a tinted theme; glass is disabled for all chrome scopes.
- Effective reduce is explicit reduce OR OS reduce. Existing `full` wording/semantics needs a product decision if changed; it must not accidentally defeat an OS reduction.
- Reduced transparency is independent of motion. Unsupported blur resolves critical text surfaces opaque, not unblurred low-opacity.
- Studio/extension input cannot override safety roles. Native material failure stays solid.

## 4. Arbitrary accents and extension compatibility

During migration keep `--accent` equal to the picked hex, preserving existing exact-value tests. Deprecate it as decorative/seed alias. New controls use `--action-fill`, `--action-ink`, `--accent-text`, `--focus-ring`; migrate legacy fill alias with the actual controls, not in isolation.

Proposed deterministic derivation:

1. Parse sRGB seed and preserve raw intent.
2. Select white/near-black action ink and validate >=4.5:1 against fill in every state; use safe boundary outline when needed.
3. Derive accent text and focus against registered surfaces, searching lightness while retaining hue where possible. OKLCH may be internal; emitted output is gamut-mapped sRGB and is what contrast checks measure.
4. If no candidate satisfies required pairs, use audited role fallback. Derive soft ink independently; 18% tint is not a contrast guarantee.
5. Hover/pressed have explicit validated fill/ink, not brightness filters.
6. Display adjustments in Appearance, not canvas. Do not call a seed universally good because one fixed background passes 3:1.

Inspected first-party package: `somnia.accent-palettes`, root `docs/extensions/catalog/packages/accent-palettes.json`. "accent-colors extension" is treated as the request's label for this inspected contribution, not proof of a separately named package.

Keep manifest v1 `{id,label,light,dark}`, hex validation and copy-on-pick unchanged. Pack supplies seeds only, not surfaces, native actions, unrestricted CSS or safety roles. Namespace `<extension id>.<palette id>`; preserve consent/enablement.

Optional later explicit selection: `{mode:'palette', paletteId, lastKnown:{light,dark}}`, alongside custom hex and theme modes. Offer "Follow this pack in light/dark" separately; never silently convert old picked colors. On disable/uninstall preserve bounded cached seed pair as saved preference, label extension unavailable, allow reset, never reactivate the extension. Schema migration reads only recognized fields.

Future frame snapshot: bounded versioned scheme/surface/text/action/border/focus/density/type/effective-motion allowlist. Use existing session-authorized MessagePort for updates, not a new wildcard window channel; discard stale revisions and unknown/invalid fields. No project content or private OS details. Updates are host UI data, not mutation permission. Initial snapshot remains until a reviewed bridge change is implemented.

## 5. Studio domain roles, never content recoloring

Optional future manifest `appearance` beside `shellV2` selects a known domain profile, not root-variable overrides. Bind domain roles on studio container; header, rails, dialogs and agent UI use global roles. Switching studio never writes global theme choice.

| Studio | Domain roles | Untouched |
| --- | --- | --- |
| Code | gutter, editor chrome, diff, diagnostics, selection | Syntax preference and authored preview; separate syntax audit. |
| Documents | page surround, selection/caret, comments | Document paper, text styles and exports. |
| Sheets | headers, active cell/range, formula/error cues | Cell formatting, chart colors, formats. |
| Slides | surround, guides, handles, thumbnail selection | Slide/master colors, dimensions and export. |
| Sound | waveform/ruler/playhead/selection/clipping UI | Source audio, amplitude/time scales. |
| Video | track labels, selected clips, playhead/trim UI | Frames, rendered titles, mapping/export. |
| Design | surround, rulers/guides/bounds/constraints | Artboard and component/prototype colors. |
| Vector | nodes, tangents, path selection/bounds | SVG fill/stroke, color decisions and export. |
| Photos | checkerboard, crop/mask/histogram UI | Pixels, edits and ICC/render decisions. |
| Vibe Space | graph selection, queue/run/failure/log roles | Agent/provider behavior; status meaning stays global. |

Over arbitrary media, use dual-tone outlines and shape, not a single accent assumed visible against every pixel. Overlays and hitboxes stay screen-space across zoom. Domain registry owns meaning, graph owns UI values. Any forced-colors opt-out is narrow to authored content renderer, never entire studio or controls. Interaction slice supplies adjacent accessible precise controls.

## 6. Accessibility acceptance rules

Target WCAG 2.2 AA for chrome with selected stronger product rules. Tokens alone cannot certify the app.

| Check | Requirement |
| --- | --- |
| Text/help/placeholder | >=4.5:1 actual background; >=3:1 only qualifying large text (1.4.3). |
| High-contrast text | Product target >=7:1 normal, >=4.5:1 large (1.4.6 is AAA); not whole-app AAA claim. |
| Required icons/control/selection | >=3:1 adjacent colors (1.4.11); decorative borders classified separately. |
| Focus | Visible/not entirely obscured (AA 2.4.7/2.4.11); product target 2px perimeter-equivalent and 3:1 state change, plus adjacent contrast (2.4.13 is AAA). |
| Targets | Aim >=24x24 CSS px after app zoom; 2.5.8 AA has spacing/other exceptions. Icon size is not hitbox. |
| Resize/spacing | 200% text resize without lost content/actions (1.4.4), text spacing overrides (1.4.12). |
| Meaning | Selected/error/dirty/diff/run state has shape/text/icon too, not color alone (1.4.1). |
| Motion | CSS and JS stop nonessential scaling/panning/pulsing/smooth scrolling; static progress and completion still work. |

At 85% UI zoom, 24px becomes 20.4px. Example minimum unzoomed target is ceil(24/0.85)=29px, or decouple hit-area layout from zoom after validation. Focus geometry also accounts for scale. Density does not reduce type.

Contrast: linearized sRGB threshold 0.04045; luminance weights 0.2126/0.7152/0.0722; ratio `(lighter+0.05)/(darker+0.05)`. Full precision for pass/fail, rounding for display only. Existing rounded helpers/grey-reference glass math are not an audit engine.

Pair registry covers default/hover/pressed/selected/focused text and identification surfaces. Composite alpha against actual bounded backdrop. Unknown photographic/native backgrounds cannot get a guaranteed ratio from reference grey; critical text uses opaque local plates unless bounds prove safety. Test white/black/busy native wallpaper. Browser blur emulation does not verify native translucency.

## 7. Buildable migration and unchanged gates

1. Inventory root writers and snapshot current theme tokens. Compiler/aliases reproduce output; record real pair failures, not exemptions.
2. Central resolver wraps existing preference readers. Test startup, live OS changes, undo/reset, malformed data, denied storage, stale variables and effect order.
3. Migrate shared controls to action/ink/focus roles. Regression: yellow custom accent + high contrast. Retain seed equality tests, add semantic pairs; fix unsafe states before claiming accessibility.
4. Studio profiles and overlay migration. Test simultaneous views, switching, zoom and portals. Ensure before/after saved/exported content is unchanged.
5. Separately add explicit follow-pack selection and live frame revisions. Test disable/uninstall/reload/session teardown, stale revisions, invalid values and sandbox boundaries.
6. Inspect screenshots at 85/100/130% UI scale and 200% text enlargement, densities, themes/high contrast/forced colors, motion and glass. Cover Settings/menu overflow and each studio's controls/overlays. Fix failures, do not blindly accept new goldens.

Unit matrix: all named themes x densities x normal/high contrast x representative seeds (black, white, yellow, cyan, red, default and pack variants). Pairwise screenshot matrix plus per-studio representative and explicit high-risk cases avoids explosion without dropping safety checks.

Retain `tests/themes.spec.ts`, `tests/extension-accent-palettes.spec.ts`, `src/lib/look.test.ts`, `lookStorage.test.ts`, `glass.test.ts`, `glass.strict.test.ts`, extension/panel and studio tests. Add tests, never weaken thresholds/assertions. No dependency installation or cargo/WASM build for this concept review.

Open decisions: safe role adjustment wording; optional follow-pack mode; proposed row/control geometry; motion-full meaning. Native forced colors/transparency/material, fonts and renderer exemptions need platform checks. Resolve only on preferences/OS/palette changes, not pointer movement; benchmark before setting release performance budgets. None of these proposed behaviors is shipped by this patch.

## Sources

Repository: live `https://github.com/philppplik/somnia.git` branch/commit above, exact inspected paths in section 1. Later APIs/paths/values are proposals.

Fetched 2026-10-14:

1. W3C WCAG 2.2, Recommendation 12 December 2024: https://www.w3.org/TR/WCAG22/ - contrast, focus, targets, resizing, spacing, color-only meaning.
2. DTCG Format 2025.10, Community Group report 28 October 2025: https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/ - typed JSON, aliases and dimensions/durations.
3. DTCG Color 2025.10: https://www.w3.org/community/reports/design-tokens/CG-FINAL-color-20251028/ - structured colors/gamut mapping and output validation.
4. DTCG Resolver 2025.10: https://www.w3.org/community/reports/design-tokens/CG-FINAL-resolver-20251028/ - contexts and resolution order; no full conformance claimed.
5. W3C CSS Color Adjustment Level 1, Candidate Recommendation 16 December 2025: https://www.w3.org/TR/2025/CR-css-color-adjust-1-20251216/ - color-scheme/system colors/forced-color-adjust, native support unverified.
6. W3C relative-luminance formula: https://www.w3.org/TR/WCAG22/relative-luminance.html - current sRGB threshold and weights.
7. MDN prefers-reduced-motion: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion - OS signal and nonessential motion.

Evidence types: standards/community specifications, implementation docs, repository code/tests. No product review is needed for this bounded architecture choice. No screenshot, test run or desktop accessibility certification was performed.
