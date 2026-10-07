/** Compact, theme-independent severity icons matching Problems (red/amber).
 * Inline SVG avoids emoji/platform font differences and external image requests. */
export const diagnosticsGutterTheme={
  ".cm-gutter-lint": {
    "width": "20px"
  },
  ".cm-gutter-lint .cm-gutterElement": {
    "padding": "0 3px",
    "display": "flex",
    "alignItems": "center",
    "justifyContent": "center"
  },
  ".cm-lint-marker": {
    "width": "12px",
    "height": "12px"
  },
  ".cm-lint-marker-error": {
    "content": "url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Ccircle%20cx%3D%228%22%20cy%3D%228%22%20r%3D%226%22%20fill%3D%22%23ef4444%22%2F%3E%3C%2Fsvg%3E\")"
  },
  ".cm-lint-marker-warning": {
    "content": "url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20d%3D%22M8%201.5L15%2014H1Z%22%20fill%3D%22%23f59e0b%22%2F%3E%3Cpath%20d%3D%22M8%205v4%22%20stroke%3D%22%23111827%22%20stroke-width%3D%221.5%22%2F%3E%3Ccircle%20cx%3D%228%22%20cy%3D%2211.5%22%20r%3D%22.8%22%20fill%3D%22%23111827%22%2F%3E%3C%2Fsvg%3E\")"
  }
};
