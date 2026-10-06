# Glass v2

User guide: [features/glass.md](features/glass.md).

Settings > Appearance. Glass only takes effect when "App background" is Glass and the native compositor confirmed it (Windows/macOS). Linux, the web app and high contrast stay solid.

| Setting | Key (`somnia.look.v2`, `look.*`) | Default |
|---|---|---|
| Opacity 0-100 % | `glassOpacity` | 68 |
| Blur 0-40 px | `glassBlur` | 24 |
| Window frame | `glassFrame` | on |
| Panels | `glassPanels` | on |
| Code editor | `glassCode` | off |
| "Keep anyway" for the low-contrast note | `glassKeepLow` | false |

CSS variables on `:root`: `--glass-frame-alpha` (= opacity), `--glass-panel-alpha` (= opacity + 20 pp, max 100), `--glass-code-alpha` (= opacity, floored), `--glass-blur`. A scope that is off, or reduced transparency, gives alpha 1; no scope on, reduced transparency or missing `backdrop-filter` gives blur 0. Default 68 / 88 / 24 px matches the pre-v2 look.

Code editor scope: `.cm-editor`, `.cm-gutters`, `.cm-activeLine` use `color-mix(... var(--glass-code-alpha))`. Text, caret and selection stay opaque. Below 60 % a non-modal warning offers "Set to 60 %" / "Keep anyway". Below 55 % the value is clamped to 55 % when WCAG contrast (text vs panel colour over neutral grey #808080) is under 4.5:1. Colours that are not plain hex cannot be measured and only get the warning.

Migration: missing keys take defaults, the old blur value is kept, so existing users look identical. The storage wrapper stays `version: 2` (adds `glassSchema: 2`) so older builds keep reading it.

Code: `src/lib/glass.ts` (maths), `src/lib/look.ts` (apply), `src/components/GlassSettings.tsx` (UI), `src/styles/bento.css` (CSS). Tests: `src/lib/glass.test.ts`, `tests/glass-v2.spec.ts`.
