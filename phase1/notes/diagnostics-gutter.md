# Code gutter diagnostics

The source editor now feeds CodeMirror's native `lintGutter` from the same
`projectProblems` result as the Problems panel, instead of a separate syntax-only
linter. This includes syntax errors, unclosed tags, missing project references,
and accessibility warnings. No network or code execution is involved.

- `gutterDiagnostics` filters to the active file, converts one-based line/column
  locations to document offsets, and clamps stale positions and EOF.
- Native CodeMirror groups all diagnostics on a line into one marker. Errors take
  priority over warnings; hovering shows every message for that line.
- Errors are red dots, warnings are amber triangles with an exclamation mark.
  Inline SVG makes their size and appearance independent of emoji fonts. Colours
  match Problems and remain visible against light and dark editor surfaces.
- Updates debounce for 300ms, matching Problems. Old markers clear immediately on
  source/file changes; timers are cancelled on re-edit, tab switch, and unmount.
  Changes to other project files also update reference and contrast warnings.
- The existing lint setting disables the gutter. Line numbers can be hidden
  independently. Project caps (50 syntax problems per file, 500 overall) stay
  identical to the panel, including its existing large-file behaviour.

Validation: unit tests cover offset mapping, file filtering, severity/message
preservation, stale locations, empty documents and EOF. Browser tests cover
marker-to-line alignment, error priority, hover messages, panel agreement,
cleanup after edits, file switching, hidden line numbers and dependencies.
Existing editor-intelligence tests cover disabling lint. Screenshot inspection
uses a dark editor with warnings on lines 4/8, an error on line 9, its combined
hover tooltip, and the corresponding Problems entries.
