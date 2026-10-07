# Appearance surfaces

Settings > Appearance adds three live settings directly below App background:

- Glass blur: 0-40 px, integer steps, default 24 px. Updates `--glass-blur`.
- Glass inner panels: default on, preserving the previous translucent workspace cards. Off keeps workspace cards opaque while retaining glass window chrome.
- Outer corner radius: 0-25 px, integer steps, default 25 px. Updates `--r-outer` for the app frame, workspace cards, Agent card and its gradient clipping. Dialogs keep `--r-panel`; controls keep their existing tokens.

The first two controls are disabled with solid background or high contrast. Values are retained when switching modes. All controls use the existing Settings live-apply, undo, reset and search behavior. Slider values include px output and accessible value text; native keyboard slider controls remain available. Copy is included in en/de/es/fr/pt-BR.

## Persistence

`somnia.look.v2` stores `{version: 2, look: ...}`. When v2 is absent, the legacy `somnia.look.v1` shape is sanitized and read, preserving accent, typography, scale, density and background. Editing writes v2; the old key remains untouched. Reset writes explicit v2 defaults so old preferences cannot return. Corrupt, unknown-version or unavailable storage falls back safely. Blur and corner values reject non-numbers/NaN/Infinity, clamp and round to slider bounds.

## Rendering limits

Glass still requires successful Windows Acrylic/macOS Vibrancy activation. Browser, Linux, high contrast and failed compositor activation stay opaque. The slider controls CSS backdrop filters on the shell and optional workspace surfaces. Windows Acrylic/macOS Vibrancy desktop blur is system-controlled, not a custom native Gaussian radius. Consequently 0 px disables the additional CSS blur, not the system desktop effect. Code, document content, dialogs and menus keep opaque surfaces.

Outer radius changes the CSS app frame, not any operating-system-enforced window mask or compositor vibrancy clipping. Native Windows/macOS appearance needs a desktop test.

## Validation

Initial light/dark mockups were rendered and inspected before implementation. Final light/dark Settings and shell PNGs were visually inspected for labels, values, readable content, unclipped controls and 12 px card/frame clipping. Screenshots live only under `phase1/test-results/`, not in source control. Native-success is explicitly simulated for CSS preview screenshots against an artificial desktop background; these are not native-compositor evidence.

- `npm run build`: passes (existing bundler chunk/dynamic-import warnings).
- `npm run test:core`: 593 tests, 590 pass, 3 skip, 0 fail.
- Targeted Playwright: `appearance-surfaces.spec.ts`, `look.spec.ts`, `window-background.spec.ts`, `panel-radius.spec.ts`: 9 pass.
- Coverage: clamping, defaults, v1 migration/v2 precedence, corruption/storage errors, tokens, live apply, keyboard, undo, reset, reload persistence, high-contrast/solid gates, all shipped localized control labels, shell/card/Agent clipping and inner-glass off.
