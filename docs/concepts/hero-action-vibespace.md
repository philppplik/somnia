# Vibe Space hero action: New task

Owner update, 2026-10-13 19:36: one header label, New task / Neue Aufgabe, replaces the earlier New Studio/New space proposal. The existing creation form opens for the selected space, or the space form if none exists. It never starts a run. Do not place New Studio/New space side by side.

# Previous reviewed concept

Status: superseded label proposal; implementation uses New task.
Research date: 2026-10-13. Code baseline: `int/shell`, `e2a188d3`.

## Recommendation and why

Decision (Philipp, 2026-10-13): the hero is labelled **New task**. The text below proposed "New Studio..."; where it says so, read "New task". The behaviour is unchanged: with a Vibe Space selected the button opens the existing Studio creation form.

Implementation note: the feature branch ships one **New task** hero for all cases and keeps creation drafts. The "New space..." variant in the table below is not implemented.

Original proposal: use **New Studio...** beside Account when a Vibe Space is selected. It opens the existing Studio creation form. Without a selected space, use **New space...**, opening the existing space form. This is a bounded setup action, never "Run all", "Approve all", "Apply" or "Publish".

The existing Vibe Space canvas already has a primary New Studio control. Promote that action to the common header rather than inventing task terminology or a new execution path. "New task" would mislabel a form that creates a Studio. Remove the duplicate canvas-header New Studio control when the global hero is available; keep helpful empty-state CTAs and per-run actions.

### Product evidence

Cursor Plan Mode researches and produces an editable plan, then asks the user to click to build. This supports preparation before execution, not automatic launch from a global header:
https://cursor.com/docs/agent/plan-mode.

Cursor Agent Review has automatic, slash-command and Source Control entry points. It is an AI code-review feature, not a user's permission to apply changes:
https://cursor.com/docs/agent/agent-review.

These sources establish workflow patterns, not a best-in-class top-right agent button. We did not verify exact placement or a universal "Run" convention. Somnia's own creation form and existing approval model are the stronger fit. Keep New Studio stable rather than replacing it unpredictably with Review whenever background work finishes.

## UX and states

| Context | Hero | Effect |
| --- | --- | --- |
| Loaded native board, selected space, creation allowed | New task | Existing form for that exact space |
| Loaded native board, no selected space, creation allowed | New space... | Existing folder/scope creation form |
| Loading, pending action or unreconciled error | Same context label, disabled | Show why; no write or stale navigation |
| Browser without native creation capability | Relevant label, disabled | Existing native-only explanation, never fixture execution |

The two labels follow explicit context, not a guessing heuristic. Expose them as declarative variants or adapter-owned registry metadata within the shell owner's common hero contract. Do not put a Vibe Space ID check in the header.

1. Header click opens/focuses the existing form. If a form has unsaved input, retain it or ask before replacing it; do not clear the goal just because the hero was clicked twice.
2. Show selected space/folder, goal, chosen model and applicable approval policy in the form. Creation still uses the existing confirmation, capability and revision checks. Opening a form incurs no model work and grants no consent.
3. No automatic provider connection, model switch, cloud spend, new permission, task start, checkpoint restore or apply/discard operation from the hero.
4. Needs review remains a dedicated rail panel with its existing categories: consent waiting, review/conflict, failed and crashed. Open an exact run from that list using `vibespace.run.open {runId}`. Never treat all such runs as the same kind of approval.
5. After creation keep existing controller navigation and status. Do not add a second native subscription, controller or snapshot cache in the header.
6. Keep publication separate from local run creation/review. The hero must never accept assistant output or push a branch merely to "finish" a task.

## Existing Commands and code ownership

| Existing command | Use |
| --- | --- |
| `vibespace.studio.new` | Opens the current Studio creation form; no run start |
| `vibespace.space.new` | Opens space creation when no space is selected |
| `vibespace.run.open {runId}` | Exact loaded run navigation from Needs review |
| `vibespace.refresh` | Existing error reconciliation, not implicit execution |

No new creation/execution command is needed for the basic hero. Existing `vibespace.studio.new` requires a ready snapshot, selected `spaceId` and `canCreateStudio`; `space.new` requires ready state and `canCreateSpace`. Commands are mount-scoped and non-agent-callable.

Important fit issue: the current `VibeSpaceHome` `newStudio` callback resets the template before opening the form. Future hero integration must make focus idempotent without dropping a draft. This is small adapter/controller UI work, not evidence that current command behavior already meets this proposal.

Grounding: `phase1/src/lib/vibespace/commands.ts`, `phase1/src/lib/vibespace/shellSession.ts`, `phase1/src/components/vibespace/VibeSpaceHome.tsx`, `phase1/src/components/vibespace/CreateForms.tsx`, `phase1/src/lib/studios/vibespace.ts`, `docs/studios/vibespace-shell.md`.

## Studio-agnostic shell contract and Publish

A hero slot is not yet in `StudioShellDef`. Extend it only through the shared owner after review. Declare command/label/icon data and bounded context variants. Register all labels/glyphs, resolve enablement through the command registry and preserve token-owned context. The shell sees readiness/identity metadata only, not goals, secrets, file contents or transport objects. No new studio branch or controller import into the generic header.

Keep `deploy.open` in shared Project > Publish and the palette with `Mod+Shift+U` and existing availability/review gates. Verify cross-studio menu discoverability during integration, since Code's explicit manifest entry alone does not prove Vibe Space exposes it. Website deployment and Vibe Space's per-run publication are distinct workflows; do not merge them or remove either review boundary.

On constrained widths use the generic action overflow. Avoid a second colored Publish button. Keep Studio pill, menus and Account stable. Five locales, accessible names, keyboard focus, theme tokens and native-only empty states must be verified.

## Effort and acceptance

Rough estimate: 0.5-1 developer day after the shared slot for manifest variants, duplicate-header removal, idempotent form focus and tests. Excludes any review/execution/publication changes. Shared slot/menu/overflow work is counted once by the shell owner.

Acceptance: first and repeated hero clicks create no native action or model request; existing form retains draft; selected space is visible; stale/missing space and blocked capabilities disable creation; after space switch no draft is submitted to the wrong folder; no consent/run/apply route is invoked; browser uses real native-only behavior; five locales and light/dark/narrow-width visuals checked; both website Publish and per-run publication remain separate and gated. Future checks are not tests run for this concept.

Roadmap-Delta: promote existing Studio/space creation forms to the hero slot. No new execution authority, agent start command, bulk approval or publication work.
