# Interface P20 delta

- Components v2 verification and live inspector preview. Variant axes (enum), typed properties (text/boolean/swap), per-property instance overrides, swap-instance with matching-variant preference and detach already shipped in P12; P20 adds the missing live preview and locks the whole loop under tests.
- Inspector: `InterfaceVariantProperties` now renders a live SVG preview (via the preview-only `exportInterfaceLayerSVG`) of the selected component master or instance, scaled to the panel. Text/boolean/swap overrides and variant switches re-render it in the same transaction.
- Tests cover: text and boolean overrides applied to the instance subtree (preview SVG content), enum axis variant switching with unknown-value rejection, swap-instance matching-variant preference plus same-component/locked guards, detach slot cleanup, snapshot round-trip stability and one undo per edit across property value, swap and undo/redo.
- One undo per edit; five locales (`interface.componentPreview`); DS primitives only (no new raw controls); no new dependencies; export surface unchanged (preview reuses the display-only layer SVG).
