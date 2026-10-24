# P1.T1: local Appearance theme importer

Base: T0 `574856e2` (not the separate state/density evidence branch).
Adds one panel to Settings > Appearance. This is the explicitly requested importer insertion, not the P3 Settings migration.
No new packages, component swap, radius change, network loading or registry command execution.

Paste JSON/declarations-only CSS, or load a local file capped at 64KiB. Both scheme previews render inert validated colors.
Unsupported paths are listed before Apply. File reads are generation-guarded so a stale read cannot replace newer typed input.
Invalid/oversized inputs cannot Apply. All UI copy has English/German/French/Spanish/Portuguese translations.

`importedTheme.ts` owns a separate local persistence record and bounded 20-step session undo history.
Apply/Reset/Undo replace complete intent; reload restores the current valid import, not the history.
Denied storage retains session behavior and shows an explicit session-only warning.
Malformed stored data is ignored. The store revalidates imported objects before stylesheet generation.

Production --sc-* aliases are installed synchronously at startup. A bounded stylesheet switches recognized chrome roles
by existing data-theme attributes; data-contrast=high bypasses imported overrides and retains the current safety roles.
No selector/property/URL comes from the input. The saved exact --accent seed remains untouched, and inline custom accent
fill/ink still outrank imported standard-mode action colors. Clearing a custom accent reveals the imported action roles.
Independent bento radii, document/page/canvas colors, syntax, native material and SDK's four-variable contract are unchanged.
Reset removes the imported declarations, leaving additive aliases that resolve the existing theme.

Mapping is intentionally bounded: imported background/foreground/card/popover/action/control/hover/border/focus/destructive
roles affect corresponding existing chrome variables. Complete --sc-* exchange pairs retain independent values, but old
Somnia consumers share text variables, so a distinct card/popover/secondary foreground is not a separate legacy-text writer.
Sidebar/chart/font/shadow/radius intent is not a global geometry/content mutation.
Previews show explicit supplied roles; missing partial-theme preview roles use explicit scheme-local Somnia defaults. Application partial roles keep their current theme fallback.
Syntactic validation does not certify contrast. High contrast is protected, but normal-mode imported pairs still need review.

Tests: pure storage/apply/reset/undo/denial/corrupt-data/bounded stylesheet checks and isolated real UI Chromium cases
for previews, ignored fields, JSON/CSS file loading, malicious import rejection, reload and protected seed/radii/high contrast.
App E2E `tests/theme-import.spec.ts` is CI-only here; no WASM prerequisite is bypassed.
Full typecheck still requires generated slides-engine/pkg/somnia_slides.js. Real Appearance layout, native startup/OS changes,
app before/after screenshots and complete accessibility/contrast remain CI/desktop checks.

Roadmap delta: P1.T1 local importer UI, persistence, own Undo/Reset, previews, unsupported report and production aliases implemented.
No broad P3 migration. State/density evidence branch remains separately integratable.
