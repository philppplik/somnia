# Foundations and design tokens

[Overview](README.md) / Tokens / [Components](components.md)

## 1. Token ownership and cascade

Implemented source is CSS plus typed preference code. There is no complete DTCG token compiler in this baseline. Do not mistake the reference JSON in this directory for a new runtime dependency.

The layers are:

1. `tokens.css`: dark fallback, light overrides, bento geometry, named palettes.
2. `global.css`: Tailwind semantic aliases, control styles, high contrast, editor syntax colors, UI preference overrides.
3. `bento.css`: loaded after global styles; workspace cards, scrollbars, glass scopes and some component overrides.
4. Feature styles: Agent, SVG, collaboration and variants, loaded after bento in `main.tsx`; other features can import local sheets.
5. Root inline values applied by `applyLook` and `applyUiPrefs`: accent, gap, geometry, scale, fonts and glass alphas.

CSS specificity and cascade layers still apply within that order. A later filename alone is not proof that a declaration wins. Inline accent can override stylesheet high-contrast accent. Inspect computed styles for the effective state.

### Naming rules for new work

**Design requirement:** name a value for its role (`--bg-panel`, `--text-secondary`), not a product screenshot's color. Keep format-scoped values prefixed, such as `--vt-*` for vector tools and `--canvas-*` for overlays. Reuse foundations before adding a semantic role. Avoid undocumented alias chains or arbitrary utility hex colors when a token exists.

The [generated snapshot](token-reference.json) preserves each declaration block of `tokens.css`, including repeated declarations. Its [palette tables](palette-reference.md) show the final stylesheet foundation values for each supported theme before inline preferences and high contrast. Both are review aids, not production token sources.

## 2. Surface and text roles

| Token | Semantic role | Usage |
| --- | --- | --- |
| `--shell-bg` | Surrounding window ground | Frame, gaps around bento cards |
| `--bg-base` | Base editing surface | Source editor and base content |
| `--bg-panel` | Workspace card | Sidebar, center, inspector |
| `--bg-elevated` | Raised interaction surface | Menus, popups, tool overlays |
| `--bg-surface` | Nested control surface | Inputs and settings sidebar |
| `--bg-hover` | Neutral hover/segmented track | Idle controls on hover |
| `--border-subtle` | Quiet separator | Card/internal rules, inputs |
| `--border-default` | Stronger edge | Popup border, scrollbar thumb |
| `--text-primary` | Main content | Labels and important values |
| `--text-secondary` | Supporting content | Secondary control labels |
| `--text-tertiary` | Quiet metadata | Hints and shortcut text |
| `--canvas-bg` | Editing stage ground | Around document artboards |
| `--page-bg`, `--page-ink` | Default document page | Separate from shell theme |

A dark app does not automatically invert an authored page. User documents own their content and colors. The foundation page defaults are `#fafafa` and `#18181b`; individual viewers can specify white pages. Do not treat that as permission to recolor exports.

## 3. Accent and semantic status

| Token | Role |
| --- | --- |
| `--accent` | Active icon, focus, selection |
| `--accent-fill` | Filled action and active tab underline |
| `--accent-soft` | Selection/pressed background |
| `--warning` | Caution or dirty marker |
| `--danger` | Error/destructive emphasis |
| `--focus` | Foundation focus shadow value |

The default stylesheet dark accent is `#818cf8` with fill `#6366f1`; default light uses `#4f46e5` for both. Named themes have their own accents. `applyLook` allows a custom six-digit hex accent and derives `--accent-soft` as an 18% color mix and `--accent-ink` by comparing white with `#101014`.

**Important gap:** custom accent currently updates `--accent`, `--accent-soft` and `--accent-ink`, but not `--accent-fill`. The shared primary Button still uses white text and the fill alias. Setting a custom accent therefore does not recolor every filled control. Do not document `--accent-ink` as universally consumed. This is an implementation issue to test before changing the accent contract.

Status is not one fully normalized token family. For example, storage dots use emerald/amber utility colors, math status styles define their own success/error/warning palettes, and canvas overlays derive their own semantic colors. Preserve these distinctions when auditing; do not claim a single global success token exists.

## 4. Geometry and density

| Foundation | Default | Role |
| --- | --- | --- |
| `--r-sm` | 5 px | Small controls, fields |
| `--r-md` | 7 px | Intermediate controls; generic menu radius |
| `--r-lg` | 11 px | Larger small surfaces |
| `--r-control` | 16 px | Header control/view pills |
| `--r-panel` | 25 px | Branded/full dialog variants |
| `--r-outer` | 25 px | App frame and workspace cards, adjustable 0-25 |
| `--gap` | 6 px | Main card gaps and shell padding |
| `--glass-blur` | 24 px | Additional CSS glass blur |

`--gap` changes to 3/6/10 px for compact/normal/comfortable density. This is **not** a universal row-height scaling system: many component heights and internal spacings stay fixed. UI zoom scales the rendered application, independently of density.

Outer radius and dialog radius are separate. A user choosing square window cards does not make every popup square. Conversely, not every existing dialog uses 25 px: the generic layered `.dialog-popup` ends up with `--r-md` through bento; Settings and specific dialog variants have their own more-specific rules. The design direction calls for consistent large popup treatment, but the current generic primitive is not that complete contract.

### Main shell measurements at 100% UI zoom

| Element | Implemented measurement |
| --- | --- |
| Header | 44 px (`h-11`) |
| Footer/status | 36 px (`h-9`) |
| Each icon rail | 44 px (`w-11`) |
| Sidebar | Default 260 px, clamp 220-380 |
| Inspector | Default 320 px, clamp 280-400 |
| Center grid minimum | 180 px |
| App frame minimum | 960 x 600 px |
| Source/design split | Default 48%, clamp 15-85% |

The PDF/layout concept's 168/288 px side cards and narrow-screen sheets are planned design values, not the current global shell's measured defaults.

## 5. Typography

Implemented body typography is 13 px / 1.45 with `--ui-font`. `applyUiPrefs` makes Inter the default first family and supports a system-font choice. The foundation fallback is `-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif`. Monospace is `ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace`.

| Preference | Default | Accepted range |
| --- | --- | --- |
| UI font size | 13 px | 10-20 |
| UI scale | 100% | 85-130 |
| Editor font | 12 px | 10-22 |
| Editor line height | 1.5 | 1.2-2 |
| Animation duration | 120 ms | 0-200 |

UI body size does not replace all explicit component text sizes. Shared compact/tiny buttons are 11/10 px; Badge is 10 px; tab triggers are 12 px. Preserve hierarchy, but do not assert these meet every accessibility requirement merely because they are documented.

**Design requirement:** readable labels, no decorative font in routine controls, tabular number styling where numeric alignment matters, copyable error text, and layout resilient to translated labels and increased font size.

## 6. Tailwind bridge

`@theme inline` maps semantic utility names to CSS values:

| Utility role | CSS token |
| --- | --- |
| `bg-base`, `bg-panel`, `bg-elevated`, `bg-surface`, `bg-hover` | Matching `--bg-*` |
| `bg-shell` | `--shell-bg` |
| `text-ink`, `text-ink-2`, `text-ink-3` | Primary, secondary, tertiary text |
| `border-subtle`, `border-line` | Subtle, default borders |
| `text-accent`, `bg-accent-fill`, `bg-accent-soft` | Accent family |
| `text-warning` | `--warning` |
| `rounded-sm`, `rounded-md`, `rounded-lg` | `--r-sm`, `--r-md`, `--r-lg` |
| `gap-shell`, `p-shell` | `--gap` |
| `shadow-card` | `--card-shadow` |
| `font-ui`, `font-mono` | UI and monospace stacks |

The inline theme bridge does not list a `danger` alias. Use the actual source rather than assuming every foundation token has a utility name. The `cn` helper combines class names with Tailwind merging; inspect a conflicting override's computed result rather than relying on class order alone.

## 7. Shadows, borders and stacking

The foundation `--shadow` is `0 24px 60px -20px #0009` in dark and `#0004` in light. It is separate from `--card-shadow`. `applyUiPrefs` selects none/subtle/standard card treatment through `data-panel-shadows`; the corresponding global declarations can override the theme's original card shadow.

Implemented stacking is local rather than a central z-index scale:

| Surface | Source value |
| --- | --- |
| Canvas selection | 2 |
| Rich-text toolbar | 3 |
| Inline text overlay | 4 |
| Alignment toolbar | 5 |
| Generic menu popup | 40 |
| Layer/tab context menu | 60 |
| Dialog backdrop | 100 |
| Dialog popup | 101 |

Portals can escape a clipped card. A document iframe has its own stacking context; raising an iframe-internal z-index does not lift an app menu above it. New overlay work must check keyboard focus, anchor coordinates, zoom, clipping and nested dialogs.

## 8. Theme resolution and high contrast

Implemented choices: System, Light, Dark, Coffee Shop (`cream`), Forest Green (`green`), Midnight Blue (`midnight`), Blue Ice (`blueice`), Grape Red (`grape`), Melon Pink (`melon`). IDs stay stable across label changes. System follows the OS light/dark media query; named themes force their mode and palette.

The app writes `data-theme`, `data-palette`, `data-contrast` and `data-code-theme` on the root. Code themes are independent: classic, ocean, forest, github, solarized, monokai, dracula and nord, with extension IDs also supported by appearance storage.

High contrast overrides main text, base/panel/hover surfaces, borders and accent in global CSS. It strengthens selected focus rules to 3 px with a 3 px offset. It also blocks native glass activation. The full set of source values appears in [the palette appendix](palette-reference.md#high-contrast-overrides).

**Gap:** do not call all palettes or arbitrary custom accents WCAG-conformant. Source-specific contrast checks exist, but complete focus, disabled, small-text and real backdrop combinations still need verification.

## 9. Glass is a capability-gated appearance

Glass requires a positive native compositor result, not just a CSS preference. Browser sessions remain opaque. A failed native call or high contrast resets `data-background` to solid. Requests are serialized and revision-checked to prevent a late response restoring an old appearance.

Implemented preference defaults: opacity 68%, blur 24 px, frame on, panels on, code off. Panel opacity is frame opacity +20 percentage points capped at 100, so the default is 68/88. A switched-off scope uses alpha 1. Reduced transparency uses opaque scopes and zero CSS blur. Unsupported backdrop blur also yields zero CSS blur.

Code opacity has a nuanced floor: below 55%, it is raised to 55 only when measurable plain-hex text/panel contrast over a neutral gray reference is below 4.5:1. Unmeasurable colors do not trigger the floor. Below 60% still warns. Blur above 24 px warns. This is a reference estimate, not contrast proof against every desktop wallpaper.

Dialogs and authored document pages remain opaque. Code glass is opt-in, with caret and text opaque. CSS blur 0 does not guarantee the OS compositor's native blur is off. CSS radius is not proof of the operating system's window-mask radius. Follow [Glass](../../GLASS.md) and [Window background](../../WINDOW-BACKGROUND.md) for platform behavior.

## 10. Overlay and format tokens

Canvas overlay colors are derived from the accent and stage background by `overlayTokens.ts`. Dark stages lift accent lightness to at least 70%; the algorithm then attempts 3:1 non-text contrast. It returns accent, ink, halo, badge background/foreground, danger and OK values. This is a computed family, not simply the current `--accent` copied onto every stage.

[Canvas overlay CSS](../../../phase1/src/styles/canvas-overlay.css) uses a 24 px padding-handle hit area, a smaller visible grip, a halo around outlines, and explicit locked/unsafe patterns. Distinguish visible mark size from hit size.

Vector tools have their own [token JSON](../vector-tools.tokens.json), shortcuts and i18n contract. Highlights include a 44 px toolbar, 36 px tool button, 8 px anchors, 6 px handles and snap radius, plus `--r-outer` panel radius. That file is checked by `vectorToolsDesign.test.ts`; it is not a proof that every SVG editor path uses every token.

## 11. Persistence

| Key | Content/contract |
| --- | --- |
| `somnia.look.v2` | Versioned look preferences; sanitized defaults and v1 migration |
| `somnia.look.v1` | Legacy fallback only when v2 absent |
| `somnia.theme` | Resolved legacy light/dark mode |
| `somnia.themeChoice` | Choice ID including System and named themes |
| `somnia.uiPrefs.v1` | Font, size, animation, motion, shadows, remember widths |
| `somnia.appearance` | Contrast, code theme, wrap lines |
| `somnia.panelWidths.v1` | Optional side widths |
| `somnia.panels.v1` | Side-panel visibility |
| `somnia.split.v1` | Split orientation, swap, ratio |

Corrupt/unsupported look values fall back safely. Numeric look values are clamped; blur and radius round to integers. Not every numeric UI preference is rounded. Do not invent stricter validation than the source performs. Widths are clamped separately on read. Turning off remember-panel-widths removes the width key; visibility has its own persisted key.
