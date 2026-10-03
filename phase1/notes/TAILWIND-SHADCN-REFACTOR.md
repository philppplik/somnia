# Refactor: Tailwind 4 utilities + shadcn components (plan)

Steering: Philipp, 2026-10-03 ("Bitte umsetzen refraktorisieren"), after asking whether the UI is Tailwind + shadcn based.

## Starting point
- Tailwind 4.3.3 is already installed (`@tailwindcss/vite`, `@import 'tailwindcss'` in global.css, so preflight is active) but no utility classes are used.
- Styling is ~29 dense lines in `global.css`, `bento.css`, `tokens.css` (CSS variables, light/dark/contrast/code themes).
- `src/components/ui` has Button, Dialog, Tabs reshaped from shadcn base-nova with custom class names.
- ADR-001 says: Base UI primitives, reshaped shadcn sources, Somnia-owned tokens, never a whole styled kit. The refactor stays inside that: Tailwind utilities and shadcn component sources on top of Base UI, with the Somnia tokens as the single theme.

## Target
1. Theme bridge: `@theme inline` in tokens.css maps existing variables to Tailwind colors/radii/spacing (`bg-panel`, `text-secondary`, `rounded-lg`, `gap-shell`). Light/dark/contrast keep working through the same `data-theme` variables. No second source of truth.
2. `cn()` helper (clsx + tailwind-merge) and class-variance-authority for variants.
3. shadcn base-nova component sources (MIT, already licensed in THIRD_PARTY_SHADCN_LICENSE.md): Button, Dialog, Tabs, Menu/ContextMenu, Input, Select, Tooltip, Separator, Badge, Switch. Added only when used.
4. Screens move from class names in CSS to utilities in this order, one PR each:
   1. Foundation: theme bridge, cn/cva, ui/ primitives (Button, Tabs, Dialog, Input, Badge, Separator). Old classes stay so nothing else changes.
   2. App shell: titlebar, WindowControls, command bar, status bar, bento layout.
   3. Panels: LayersPanel, ElementsPanel, Inspector.
   4. Canvas: toolbar, stage, selection overlays that live outside the iframe, context menus.
   5. Dialogs: Settings, CommandPalette, DiskComparison, SourceDiff.
   6. Cleanup: delete dead rules from global.css and bento.css, keep only tokens, iframe/preview styles, syntax themes and keyframes.
5. Stays plain CSS: design tokens, syntax/code themes, the sandboxed preview document styles, resize handle grip pseudo-elements, keyframes.

## Guardrails
- Before step 1: capture baseline screenshots (light, dark, high contrast, 960x600 and 1440x900) via Playwright. After each PR: same screenshots, review the diff by eye, no unintended change.
- Full Chromium suite and core tests green per PR. Selectors in tests rely on roles and names, so behavior must not change.
- No behavior, store or core changes in these PRs.
- Preview iframe content is not touched by Tailwind (srcDoc has its own document).
- Bundle size: record `vite build` size before/after; Tailwind purges unused utilities.
- Small PRs into phase1-foundation, no main merge, no deploy.

## Open decisions (Philipp's)
None blocking. If he wants stock shadcn look instead of the Somnia bento look, tokens decide that, not component code.

## Progress
- PR 1 (foundation): clsx, tailwind-merge, cva, `cn()`, `@theme inline` bridge in global.css, Button as cva + utilities (sizes normal/icon/compact/tiny/row), old `.button*` CSS removed. Layer-row buttons are now 24px wide as originally intended, so tree names truncate less.
- Test note: tests/desktop.spec.ts is flaky (Control+K / Control+O focus race). It also fails intermittently on the unchanged baseline; 3/3 pass on re-run.

## Step 2 status (app shell)
Titlebar, toolbar, status bar, WindowControls now use utilities. Added `ui/badge` and `ui/separator`. Dead shell CSS removed. `data-tauri-drag-region` and the `.save-state` marker are kept. `titlebar.spec` selects `banner` role.

## Step 3 status (panels)
LayersPanel and Inspector converted to utilities, matching dead CSS removed. Layer names no longer truncate (the old truncation selector never matched). Inputs inside utilities need `!` because the global `input` rule is unlayered.

## Step 4 status (canvas chrome)
Canvas toolbar, device controls, zoom field, breadcrumbs and code pane header/note use utilities (pixel-identical in light 1440). Selection overlays (selection-box, resize/padding handles, text overlay, richtext toolbar) stay in CSS on purpose: JS sets their geometry and they use pseudo-elements and z-order that read better as CSS.
