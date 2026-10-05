# Live preview (design, v10)

Status: design, not built. Today the canvas is an editing surface: scripts, external links, event handlers and network are stripped (see renderPreview.ts). That stays. Live preview is a separate, opt-in mode.

## Goals
- Run the page as a browser would, including its own JS and linked CSS/JS from the project, without weakening the editing canvas.
- Refresh on save and on a short debounce after edits; keep scroll position.
- Error overlay for script errors and failed resource loads.
- Device frames (phone, tablet, desktop) around the same viewport control.

## Design
- New view mode "Preview" next to Visual / Split / Code. The canvas keeps its current sanitized render.
- Preview is a sandboxed iframe: `sandbox="allow-scripts"` only (opaque origin, no same-origin, no top navigation, no forms, no popups). Content served via srcDoc built from project files: linked CSS and JS are inlined from the project (relative paths only, same resolver as today).
- CSP: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'`. No network. Project images are inlined as data URLs.
- Error overlay: a small injected bridge script posts `window.onerror`, `unhandledrejection` and resource errors to the parent via postMessage; the parent validates `event.source` is the preview frame and renders a dismissible overlay with file and line (mapped to the source where possible).
- Reload: full srcDoc swap on save, or on a 600 ms debounce after edits when "Auto refresh" is on (default on). Scroll position is stored by the bridge and restored after load.
- Device frames: CSS frame around the iframe, driven by the existing viewport presets.

## Risks and open points
- Running author scripts is the main change in trust. The project is the user's own, but a downloaded or zipped project may not be. First use of Preview in a project shows a one-time prompt, remembered per project.
- Scripts that need network, storage or fonts will not work under this CSP; the overlay says so instead of failing silently.
- Large projects: inlining all assets on every refresh needs a size cap and a cache.

## Tests
Playwright: a page with a throwing script shows the overlay; edit refreshes the preview; scripts cannot reach the parent (no same-origin) or the network.
