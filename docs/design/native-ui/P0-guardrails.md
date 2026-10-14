# P0 implementation: guardrails and accent safety

Base: `int/shell` at `22fe72d8b95109b71eca4a1f5ac223e4977994f8`, fetched on 2026-10-14.
Scope: P0 only. No primitive migration, appearance resolver, token compiler, SDK revision or P1 work.

## Ratchet

Run `cd phase1 && npm run check:ds` and `npm run test:ds`. CI runs both.
`npm run ds:baseline` accepts reductions only. A newly introduced area has a zero budget.
The committed `scripts/ds-baseline.json` lists the per-area counts and metric-specific exceptions with reasons.
TSX uses the already-installed Babel parser, so comments and strings containing fake tags do not count as controls.
CSS color counts exclude comments. Test modules and framework templates are not application debt.
Inline object styles count even when their values are geometry: P0 does not decide which geometry to migrate.
Do not expand exception scopes to get a change through the check.

`ds-hooks.json` inventories literal E2E class/attribute selectors, test IDs, roles and CSS-variable reads,
plus the four extension panel variables. Entries include readers and source-backed owners.
The check refuses disappearance of an existing source-backed hook, even if its test is deleted too.
It allows hooks to move between files. The inventory is a static safety net, not a proof of runtime reachability:
dynamic selectors, translated accessible names, browser-owned classes and generated fixture content require manual review.
Source presence does not prove that a hook still belongs to the same rendered element. Existing E2E tests remain gates.

## Additive aliases

`tokens.css` has 10/11/12/13px font aliases, the existing spacing values, canvas/menu/dialog z-index aliases,
and status ink/surface values matching the existing math pills. They do not migrate consumers.
Tailwind typography uses `text-ds-*` to avoid overriding existing `text-xs` and `text-sm` utilities.
Spacing uses explicit `*-Npx` names; Tailwind's rem-based numbered utilities remain unchanged.
Existing geometry, document colors, syntax themes, SDK variables and consent markup are untouched.

## Accent fix

`applyLook` writes the sanitized custom seed to the missing `--accent-fill`, derives ink, and removes all four
custom overrides on reset. The primary Button uses the derived ink. Its targeted unlayered ink rule is necessary
because the existing unlayered bare `button` rule wins over Tailwind layers; moving the bare rules is P6, not P0.
High-contrast CSS owns effective fill, ink, soft tint and focus ring even when a custom accent is set inline.
The exact picked `--accent` remains intact for saved preferences and extension compatibility.
The later full safety resolver and normal-mode arbitrary-accent focus contrast audit are not implemented here.

## Verification and remaining gates

- New script unit tests and existing look/storage/glass tests run without engines.
- `node scripts/ds-css-proof.mjs` builds the real CSS/Tailwind bridge and checks custom-yellow ink and
  light/dark standard/high-contrast precedence in isolated Chromium. This is not app E2E.
- App E2E `tests/design-system-accent.spec.ts`, existing `extension-accent-palettes.spec.ts`,
  `themes.spec.ts`, `appearance-surfaces.spec.ts` and studio/SDK gates are CI-only here.
- Full typecheck needs the pre-existing generated `slides-engine/pkg/somnia_slides.js` artifact.
- Per-studio and major-dialog light/dark/high-contrast screenshot baselines are still pending the CI harness.
  The isolated CSS proof does not replace them. Do not call the complete P0 visual-baseline milestone finished.
- Frameless Windows/macOS chrome, native glass, forced colors and fonts still need desktop testing.

Roadmap delta: P0 ratchet, literal hook inventory, additive alias scales and custom-accent safety implemented.
P0 full-studio screenshot baselines remain open. P1-P6 unchanged and not started.
