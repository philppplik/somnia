# Code Studio hero action: Preview

Status: design proposal, not implemented. Philipp reviews this before development.
Research checked: 2026-10-13. Repository baseline: `int/shell` at `e2a188d3`.

## Recommendation

Replace the universal Publish button beside Account with **Preview** in Code Studio.
Use a play/preview glyph from the existing icon system. This is a local preview toggle,
not a promise to execute arbitrary source files, run a debugger or deploy a website.
Publish stays in Project and the command palette.

## Product evidence and alternatives

- Webflow explicitly puts Preview, Share and Publish in its top-bar site actions.
  Preview renders the page for inspection; Publish targets staging or production [1].
  The useful distinction for Somnia is inspection versus delivery, not copying all
  of Webflow's cloud controls.
- VS Code starts Run and Debug from its dedicated view or F5; its debug toolbar
  appears during a debugging session [2]. This supports a context-bound execution
  action, not the claim that every editor has one universal top-right Run button.
- **Preview** wins over **Run**: Somnia's actual action is live web preview.
  **Publish** remains useful but is outbound and not the next step for every edit.
  **Format** is frequent but belongs with editing tools, not this outcome slot.

This is a fit-based design recommendation, not a usage-frequency study.

## UX and states

1. Clicking Preview dispatches the existing `view.livePreview` toggle.
2. Its selected state follows `livePreview`, with `aria-pressed`. Keep the label
   Preview stable; the selected tooltip says "Close live preview".
3. The existing command moves Code-only view to Split when opening the preview.
   Closing the preview preserves the existing view-mode behavior; do not invent
   a restoration stack in the header.
4. Enable only when the existing command is enabled **and** Code has a supported
   preview document/project. HTML is the initial supported path. A CSS/JS tab may
   use an already resolved HTML page, but must not guess an entry file. Plain text,
   JSON and unsupported standalone source files show "No previewable page".
5. Empty studio: keep the slot disabled; Open/Create stays in the empty canvas.
   Busy/loading: disable with an accessible reason, without moving Account.
6. Preserve the preview's current script preferences, sandbox and framework
   routing. Opening Preview must not enable scripts, install dependencies or
   start a new trusted execution path silently. Verify framework startup behavior
   separately before enabling the hero for framework projects.
7. Render and runtime errors stay in the preview/Problems surfaces, not a second
   debug ribbon across the main header. Unsaved in-memory content may be previewed;
   the hero does not auto-save or clear the dirty state.

## Existing commands and code

| Item | Current fact | Proposed reuse |
| --- | --- | --- |
| `view.livePreview` | Core UI command, toggles livePreview; checks coreConnected | Hero dispatch, same enabled state plus studio capability gating |
| `view.design`, `view.split`, `view.code` | Declared Code view commands | Remain in View; no duplicate mode pill |
| `deploy.open` | Opens Publish dialog; desktop-gated | Project > Publish and palette, unchanged |
| `palette.open` | Existing shared command entry | Keep the separate Commands control |

Grounding: `phase1/src/lib/commands.ts`, `lib/studios/code.ts`,
`components/LivePreview.tsx`, `components/PublishDialog.tsx`, and `App.tsx`.
The current Publish header calls the store directly. Its future menu/palette
route should continue to use `deploy.open`, not copy that direct handler.

## Shell boundary

Use the same header slot, height, spacing and emphasis as every other studio.
The shell renders active-manifest data; it must not contain `if studio === 'code'`.
A future optional declarative hero descriptor may name a command, localized label,
icon and capability/pressed state. **No such hero property exists today** in
`StudioShellDef`; agree its additive shape with the shell owner first. Command
execution and preview state stay with Code. Preserve menus, rails, panel hosts,
context ownership, account placement and window drag regions.

At narrow widths use the same generic compact/overflow treatment for all studios;
retain a keyboard-accessible named action and never truncate the Account control.
Keep Publish reachable in Project > Publish via `deploy.open`, the palette and its
existing Mod+Shift+U shortcut. Respect existing desktop availability. A deployment
in progress must remain visible in the dialog/status surfaces after the universal
header spinner is removed; the shell owner must verify that affordance.

## Effort and acceptance

Planning estimate, not a delivery promise: 0.5-1 day for Code wiring, capability
checks and tests after the shared slot exists. Shared slot work is separate.
Framework permission/startup review can increase scope; do not bundle a debugger.

Acceptance: correct pressed state; repeated clicks open/close predictably;
HTML versus non-previewable files; unsaved buffers unchanged; no new script or
server side effects; studio switches release stale state; Publish still reachable;
five-language labels; keyboard/screen-reader checks; light/dark and compact header
screenshots. No implementation or visual validation is claimed by this concept.

## Sources

[1] Webflow Help, "Intro to Webflow", official UI documentation, no date shown:
https://help.webflow.com/hc/en-us/articles/33961260162323-Intro-to-Webflow

[2] Microsoft, "Debug code with Visual Studio Code", official documentation,
no date shown: https://code.visualstudio.com/docs/debugtest/debugging

Roadmap-Delta: add a review-gated Code Preview hero and generic header-slot dependency;
keep deployment and debugger work outside this concept.
