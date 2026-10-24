# Documents private selection review preview (BL)

Visible inspector entry for BI/BJ: explicit Review selected text, frozen source
span/bytes and literal selected text, discard. No AI request/summary/edit/save.
Preview privately held in component memory, never panel preferences or prompt.
Identity remains internal; display name/paragraph/UTF-8 extent only. Capture must
be available/settled; safe unavailable/failure hints in five locales. Owner/rev/
status/caret/block changes discard preview; synchronous fresh capture comparison
prevents stale rendering before effects. Unmount invalidates late await completion.

2 browser fixtures pass: zero initial preview, explicit capture, HTML inert, caret
change discard, five locale placeholders, light/dark390px readable/no overflow.
21 existing Documents/capture/command/export/component tests pass unchanged.
DS/Commands/Inventory/Layers pass with inherited compiler/87ignored/4stale caveats;
tsc only inherited generated Slides missing. No native/WASM/full-app E2E or actual
AI/provider work. No new deps/spend. Scope selected one editable paragraph only.

Roadmap-Delta: private review surface provides user-visible capture value; reviewed
summary generation, copy/export, rewrite acceptance and fidelity remain separate.
