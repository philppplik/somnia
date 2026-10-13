# Vector header export

The Export... hero dispatches `vector.export.open`, a UI-only focus request. The studio's adapter opens its registered Export panel, unfolds it and moves it first in the right stack while retaining other panels. Repeated clicks focus setup rather than toggling it closed. No drawing mutation, dirty reset or implicit file export occurs. A request is consumed once so returning to the studio does not replay an old focus request.

Choose SVG or PNG. PNG offers 1x/2x/4x and shows the effective width and height after the existing 8192-pixel-per-side cap. Whole-page scope is explicit. Submit reuses the existing dispatcher export commands; errors remain inline alongside the diagnostic flow. SVG import is separated below the output controls. Setup writes nothing when closed.

There is no new Vector shortcut. The split menu offers the existing one-click export commands plus the shared Publish entry. Native file picking, PDF, selection-only export, slices and a new export modal are not implemented or advertised.

Validation: ready/stale studio enablement, focus-only immutability, request lifecycle and dimension cap tests; real browser SVG download, repeated focus and 4x cap display in light/dark. PNG rasterization at small size is browser-tested separately. Desktop browser-download behavior and Windows remain unverified.

Roadmap-Delta: Vector Export promoted to header with focus-only setup and honest capped PNG dimensions. Export formats and engine remain unchanged.
