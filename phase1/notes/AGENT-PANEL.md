# Somnia Agent side panel (UI)

Branch `agent/panel-ui`, base `origin/phase1-foundation` (56e2732). UI only: the real core lives on `agent/core`.

Status (6 Oct 2026): merged into `somnia-agent` and wired to the real core through `src/lib/agent/panelBridge.ts`; `stubCore` remains for tests. The panel now also has a configuration form, file approval cards and hunk review (`AgentReview`). Event and request shapes are in `src/lib/agent/core.ts`, the full picture in [docs/agent/ARCHITECTURE.md](../../docs/agent/ARCHITECTURE.md). The sections below are the original branch notes: the core interface now also has `approval` and `usage` events and `applyProposal(id, decisions?)`; chat history is still in memory only; the Settings button opens the in-panel configuration, with AI privacy in app settings.

## What is built
- Right side panel (340 px, 25 px radius), opened from the Vadivam `sparkles` button at the bottom of the right icon rail, or `Ctrl+Alt+A` (command `agent.toggle`). The header collapse button closes it.
- Gradient only at the bottom: `src/assets/agent-gradient-bottom.svg` (colours live in the SVG) plus four stacked `backdrop-filter` layers for the progressive blur. No top gradient. The rail opener sits on the same SVG.
- Bubbles (user right, agent left) are blurred discs with masked edges. Input row at the bottom. States: empty with chips and tip, streaming (caret, spinner row, stop button), diff actions (Accept / Reject, then result with Undo).
- Icons: global Vadivam (iconify `vadivam`, MIT, v0.0.46). `src/lib/icons.tsx` replaces `lucide-react` everywhere (same export names, inline SVG, `data-icon="vadivam:<name>"`). `lucide-react` is removed from `package.json`; `thirdParty.json` lists Vadivam.
- Light and dark themes via the existing tokens. Strings are in all five locale files (`agent.*`).
- Accessibility: named icon buttons with tooltips, visible focus, `role="log"` chat, one polite status announcement per run (not per token), reduced motion respected.

## Core interface (assumptions)
The panel only talks to `src/lib/agent/core.ts`:
- `run(request, onEvent) -> {cancel()}`; events: `status`, `text-delta`, `proposal`, then `done` or `error`.
- `applyProposal(id)`, `rejectProposal(id)`, `revertProposal(id)`.
- A proposal is one file with `lines` (`add` / `del` / `ctx`), `added`, `removed`.
- Request context: `{prompt, context:{activeFile, selectedElementId}}`.
- `setAgentCore(core)` swaps the stub for the real core. Until then `stubCore` streams a fixed reply and a fixed diff and never touches the project or the disk.

Assumptions to confirm against `agent/core`: events arrive on the main thread; `applyProposal` puts the change into the editor but does not save to disk; one run at a time; reject of a pending proposal and revert of an applied one are separate calls.

## Not done / decisions for later
- Accepting a diff in the stub changes nothing in the editor. The real core must do that, ideally as a split in the code editor (see `SourceDiff`).
- The paperclip button only inserts `@` (reference marker) for now. File and element references are part of the core request context, not yet of the UI.
- The tip text "Use @ to refer …" comes from the spec. It describes a feature the core has to implement.
- Chips send immediately (as in the spec demo). The concept doc says chips should only fill the input; pick one.
- Settings button opens the app settings; an Agent section there needs the core (model, key).
- Chat history is in memory only.

## Tests
- `src/lib/agent/chat.test.ts`: reducer and stub core (10 cases).
- `tests/agent-panel.spec.ts`: opener, toggle, empty state, bottom-only gradient, send/stream/stop, diff accept/undo/reject, new chat, shortcut, settings.
