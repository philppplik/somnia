# Theme importer: contributor contract

Settings > Appearance accepts pasted JSON/CSS or a local file, previews light/dark, reports ignored paths,
and applies a color-only override. No link fetch, network, registry install, component execution or dependency install.

## Accepted data

- JSON registry theme/style with `cssVars.light` and `cssVars.dark`; common `cssVars.theme` colors can fill both.
- CSS with exactly bounded `:root { --role: color; }` and `.dark { --role: color; }` variable blocks.
- Both schemes need at least one recognized color. Partial schemes use legacy production roles for unspecified colors;
  preview cards use explicit scheme-local defaults, not the current app mode.
- Full literals only: hex, rgb/rgba, hsl/hsla, oklch. No named colors, channels-only HSL,
  var/calc/url or CSS suffixes. Unsupported selector/at-rule syntax rejects the input; trim to variable blocks first.
- 64KiB input, 256 variable entries, bounded JSON depth/tokens; duplicate keys and prototype keys reject.

```css
:root { --background: #fafafa; --foreground: #18181b; --primary: #4f46e5; --primary-foreground: #fff; }
.dark { --background: #0e0e10; --foreground: #fafafa; --primary: #6366f1; --primary-foreground: #fff; }
```

`themeExchange.ts` owns parsing and normalized export. Unknown variable roles reject; known unsupported font,
radius, chart, shadow, tracking/spacing fields are ignored and reported. Registry metadata such as dependencies,
files or instructions are data only, never executed. Do not render raw parser errors as UI prose.
Normalization is color-only: unsupported metadata is not a lossless exported roundtrip.

## Persistence and safety

`importedTheme.ts` owns the isolated store/key `somnia.importedTheme.v1` and bounded validated stylesheet.
`installImportedTheme()` runs at startup. Apply revalidates; Reset removes active intent;
Undo restores one of at most 20 session states. Current theme persists, Undo history does not.
Storage denial means session-only state, reported in the panel. Corrupt stored data is not injected.
Async local file reads cannot overwrite a newer panel draft. No arbitrary stylesheet string is injected.

`--sc-*` avoids the conflicting shadcn accent role. The bounded production role adapter changes only recognized
shell colors under current `data-theme`; high contrast bypasses imports, and custom action preferences retain precedence.
It does not take over OS mode switching. Saved accent/radii, content/canvas/syntax and native material stay untouched.
Distinct imported card/popover/secondary foregrounds remain isolated aliases where legacy text roles are shared.
Syntactic validation does not certify contrast; pair/opacity audits remain a release gate for broader adoption.

## Tests and extension work

Run exchange/storage unit tests and isolated importer parity tests; real app `tests/theme-import.spec.ts` is CI-only
with actual engines. Check Apply/reload/Undo/Reset, storage denial, malicious CSS rejection, partial previews,
custom accent and high contrast before widening target roles. Wider token mapping or reset/registry integration
requires a reviewed contract and new tests, not an expanded allowlist alone.
