# Theme authors: color exchange and studio checks

Use full literal colors in JSON `cssVars.light` / `cssVars.dark` or CSS `:root` / `.dark` declarations.
See [importer contract](theme-importer-guide.md) for exact accepted syntax and limits. Supply both schemes,
foreground/background pairs, and tested primary ink. Partial schemes are accepted but cannot prove pair contrast.
Namespaced `--sc-accent` is neutral interaction paint, never Somnia's exact saved `--accent` seed.
No radius/font/shadow/document/canvas/syntax/native-material imports. Metadata is ignored or rejected, never installed.

## Advisory contrast warnings

Preview now checks supplied text pairs: base/card/popover/primary/secondary/muted/accent/destructive and sidebar pairs.
A ratio under 4.5:1 receives a warning for the normal-text check. Original values remain exact; Apply is not silently
blocked and no corrective color is invented. Alpha, missing pair or unsupported browser conversion is Not verified,
not a pass. Browser-supported OKLCH/HSL/RGB colors are converted to actual sRGB canvas pixels for this advisory audit.
Gamut conversion, 8-bit rounding, large text, icon/non-text, focus ring/background and compositing need manual review.
This is not WCAG certification or proof that all legacy consumers use distinct imported foregrounds.
The warning is an inline note, not a second active-theme status or disruptive live region.

## Studio author checklist

- Animation: viewer document fill is authored content. Inspect numeric labels, timeline, selected key/path rings
  over different authored colors, output state and primary actions. Do not recolor frames to improve shell contrast.
- Interface: frames/text/strokes/images are authored content. Inspect layout/component fields, instance restrictions,
  group collapse, selection and exported documents separately from app chrome.
- 3D: model material/environment are authored content. Inspect object/light fields, Recent, marquee and replacement
  dialog; camera render output must not inherit the app theme.
- Test light/dark, high contrast bypass, custom saved accent precedence, every density, keyboard focus and long labels.
- Apply, reload, Undo, Reset, export JSON/CSS and re-import: recognized role colors must roundtrip unchanged.
  Unsupported metadata is intentionally not lossless. Undo history is session-only; active import persists.

Coverage: pure JSON/CSS roundtrip and no-mutation contrast tests, isolated warning/Apply/browser-color tests,
and CI-only three-studio real app roundtrip/seed/radius tests. Actual full studio pixel/contrast verification remains
CI/native review. Imported colors cannot be advertised as safe merely because parsing or roundtrip passed.
