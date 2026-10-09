# Design Studio QA corpus

These small local inputs exercise SVG export/interchange boundaries. Design's native project import is JSON; these SVG files do not imply an SVG import feature in Design Studio (Vector owns SVG editing).

| File | Purpose |
| --- | --- |
| `blank.svg` | Empty 640 x 480 artboard reference. |
| `layered-card.svg` | Layer order, rectangle/ellipse geometry, fill, text and Unicode reference. |
| `geometry.svg` | Negative coordinates, fractional dimensions, opacity and escaped text. |
| `unsupported-features.svg` | Gradient, transform, path and hidden content for fidelity-limit checks. |
| `active-content.svg` | Harmless local sentinel script, event handlers, HTML and remote-image reference for security checks. Never load without a request guard. |
| `malformed.svg` | Broken XML. |
| `not-a-design.svg` | Plain text with an SVG extension. |

The active-content fixture only sets `window.__designFixtureExecuted`; it contains no private data or real tracking endpoint. The `.invalid` host must never be contacted. Test its contents or parse/export it in an isolated environment, not by unrestricted navigation.

No fixture depends on platform fonts for exact glyph pixels. Text correctness is tested as content, not as a cross-platform pixel snapshot.

## Native `.somdesign` fixtures

`blank.somdesign`, `layered.somdesign`, `multiple-artboards.somdesign` and `layer-flags.somdesign` follow the core contract: `format: "somnia-design"`, `version: 1`, artboards and rectangle/text nodes. The flags fixture checks hidden and locked fields survive serialization. Negative cases are malformed JSON, wrong version/format, duplicate node IDs, negative width and unknown node kind.

The SVG inputs remain separate interchange references. Their native import checks belong to Vector Studio, not the Design suite.
