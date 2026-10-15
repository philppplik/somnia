# Coding project CSS completion

The existing HTML completion popup now adds class and ID names from CSS text files already loaded in the current project. Type inside a quoted HTML `class` or `id` value, or use Ctrl+Space. The existing autocomplete preference controls this source too. Built-in HTML tag and attribute completion is not overridden. There is no extra menu, toolbar or panel.

Class suggestions replace the current whitespace-delimited token, preserve other classes and omit classes already used in that value. ID suggestions are separate. A suggestion shows its CSS origin files and says the cascade was not checked. Accepting a project CSS suggestion creates a separate owner undo step, not a combined undo of the preceding typing.

This is a syntax-derived list from all loaded `.css` files, not proof that a stylesheet is linked, the selector matches, the class has an effect, the cascade wins or an ID is unique. CSS files are parsed with the existing CSS parser. Only simple ASCII class/ID names are indexed, up to 120 characters with an optional initial hyphen. Escaped/Unicode names, attribute selectors, comments and string contents are not guessed. Embedded style blocks, Sass/Less, CSS modules and remote stylesheets are not indexed.

HTML context is checked through the syntax tree. Unquoted values, comments, script/JSX, unrelated attributes, entity/template values, IDs containing whitespace, read-only editors and multi-cursor selections get no project suggestions. Multi-cursor completion is deliberately omitted rather than collapsing the selections.

The index is bounded to 5,000 loaded project paths, 32 CSS files, 256k total CSS characters, 100k per file, 20k syntax nodes, 1,000 names and a 50 ms aggregate indexing budget (10 ms parser completion per file). Budget-limited/unfinished indexing yields no project suggestions, not a partial list. Individual selector subtrees with parse errors are skipped. A cached index is reused while CSS texts are unchanged; HTML typing does not reparse the CSS set.

Before insertion, the exact current HTML value, latest CSS name, editor writability/canonical source and project generation are checked again. Removing the CSS suggestion or changing projects refuses stale insertion with a notice. No network, disk read, package install or code execution is added.

Focused tests cover selectors/origins, value boundaries, separate IDs, exclusions, limits, cache refresh, stale insertion and multi-cursor refusal. Browser tests cover exact insertion and independent owner undo in Light/Dark, ID completion, preserved built-in HTML completion, stale CSS and the existing setting. Local area TypeScript, DS ratchet, layer and manifest checks apply. Native/WASM/packaged desktop verification remains CI-only.
