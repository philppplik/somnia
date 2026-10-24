# Coding file symbols

Tools > Navigation > Go to file symbol opens a filterable list for the active JS/JSX/TS/TSX editor. The default shortcut is Ctrl/Cmd+Shift+O. Filter terms match names and named containers. Click a row, or press Enter when exactly one row remains. Tab reaches each row. Navigation works in read-only editors and never edits source or adds undo entries.

The list uses the existing syntax parser. It includes simple named function/class declarations, direct variable declarators, methods, fields (including private names), interfaces, type aliases, enums and namespaces. It preserves duplicate names with separate source positions. Parameters, imports, destructuring bindings, computed names and anonymous declarations are omitted. Arrow function variables are labeled as variables, not inferred functions. HTML keeps the existing DOM outline.

This is file-local syntax navigation, not a language server, reference lookup, binding resolver or project-wide index. It refuses partial parses, invalid syntax and work beyond 100,000 UTF-16 characters, 10,000 syntax nodes, depth 80, 500 symbols or the parser's 100 ms completion budget. Names over 160 characters are omitted. A reviewed list is pinned to its exact editor, project generation, file and source. Any change refuses the jump; close and reopen to refresh.

Verification for this slice: focused parser and command tests, browser navigation/readonly/stale-source/stale-project tests, Light/Dark visual inspection, local area TypeScript, design-system ratchet and command manifest check. Native, WASM and packaged desktop CI remain outside these local checks. The existing generic Core command test also fails on docs.open's required id parameter in this base; this slice does not change that spec or weaken the test.
