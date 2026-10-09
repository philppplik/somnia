# CSS Variable Inventory

Right-side panel that lists the CSS custom properties (design tokens) of the open project: where each one is defined, where it is used, a color swatch for color values, tokens that are used with `var()` but never defined ("missing"), and tokens that are defined but never used ("unused"). Click a row to see every file and line.

No worker code, so it is eligible for the GitHub index. See docs/extensions/12-authoring-kit.md.

## Permissions

| Permission | Why |
| ---------- | --- |
| `project.read` | Reads the CSS, SCSS, Less, HTML and SVG files of the open project (including unsaved changes) to find `--name` definitions and `var(--name)` uses. |

Nothing is written, nothing leaves the panel (no network), and project scripts are never run. HTML is parsed with `DOMParser`, which does not execute scripts, and results are shown with `textContent`.

## Limits

This is a static scan. It does not model the cascade, scopes, `@media` or `@supports`: a token defined in several places is listed once with its first value and an "x2" marker, and the detail view shows every definition. Variables set or read from JavaScript are not seen, so check "unused" before deleting. Press Refresh after editing; the panel gets no change events in apiVersion 1.
