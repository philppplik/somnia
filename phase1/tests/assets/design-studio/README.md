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
