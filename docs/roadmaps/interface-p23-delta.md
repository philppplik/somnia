# Interface P23 delta

- Dev Mode handoff section in the inspector (all local, undo-neutral):
  - Measurements: `interfaceMeasurements` derives scene-space rects, per-layer distances to the parent edges and pairwise horizontal/vertical gaps for the current selection (1-8 layers, 16-pair cap, hidden skipped). Values render in the section and, via an ephemeral opt-in checkbox, as dashed redlines with pixel labels on the canvas (`InterfaceMeasurementsOverlay`, no document or history writes).
  - Snippets per selected layer: existing CSS copy plus new Tailwind-ish (`interfaceLayerTailwind`, arbitrary-value utilities, layout/text mapping) and SwiftUI-ish (`interfaceLayerSwiftUI`, escaped text, Color/frame/VStack hints) clipboard copies. All snippets are display-only illustrations with explicit warnings, never compiled or evaluated.
  - Assets: `interfaceLayerAssets` lists exportable artwork inside the selected layer subtree (embedded images and ellipse/line/path vectors, 32-entry cap, hidden skipped) with per-entry SVG (existing layer renderer) and PNG @1x/@2x downloads through the existing rasterizer.
  - Design tokens: the existing P15 CSS-variables and JSON downloads remain in Export and handoff; the Dev Mode note points at local-only scope.
- Five locales via a P23 catalogue; DS Button/Checkbox only, no raw controls; no new dependencies.
