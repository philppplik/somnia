# Vibe Space studio shell

The manifest is pure data in `phase1/src/lib/studios/vibespace.ts`. Hosts register in
`components/vibespace/registerShell.ts`, imported once by `App.tsx`. The shared shell
renders panel stacks, rail customization and the generic inspector. Vibe Space no longer
forces both app sidebars closed.

## Panels and defaults

- Left: Vibe Spaces, Studio runs and Needs review. The first-open layout shows Vibe Spaces.
- Right: the generic Vibe Space inspector; Memory and Skills are available only for a
  loaded native space. Skills starts in rail overflow. The inspector is open by default.
- All rail items have translated labels and registry-backed Vadivam glyphs. Reorder,
  pin, hide, overflow and reset use the shared per-studio customization implementation.
- Studio runs has a persisted filter. Needs review includes waiting consent, review/conflict,
  failed and crashed runs; ordinary running work is not mixed into this list.
- The inspector shows scope and approval policy, selected run/model/state/time, provider
  token usage and reported cloud cost, and a collapsed checkpoint list. Local and zero
  costs are not presented as cloud charges.
- Memory and Skills reuse their existing native-backed editors and approval flows. They
  are keyed by space to avoid carrying another space's edit/review state. Reconciliation
  locks make the editors inert. No fixture or browser fallback connects these editors.

## Ownership and commands

`VibeSpaceHome` remains the only run snapshot/controller/transport owner. Its shell bridge
publishes a read-only projection in `lib/vibespace/shellSession.ts`; it does not introduce
another native event subscription, controller or execution path. Both the projection and
`StudioContext` are token-owned, released on unmount, and ignore stale reports.

`registerVibeSpaceCommands` in `lib/vibespace/commands.ts` registers mount-scoped UI commands:

| Command | Payload | Effect |
| --- | --- | --- |
| `vibespace.space.select` | `{spaceId: string}` | Select an exact loaded space, clear run/form |
| `vibespace.run.open` | `{runId: string}` | Open an exact loaded run and its space |
| `vibespace.home` | none | Return to the board |
| `vibespace.space.new` | none | Open the existing space creation form |
| `vibespace.studio.new` | none | Open the existing Studio creation form |
| `vibespace.refresh` | none | Reconcile the existing controller's native state |

Payload commands have schemas, typed payload interfaces and runtime identity validation.
Navigation/creation-form commands are disabled during loading, pending actions or errors;
creation forms also require the corresponding native capabilities. Refresh remains available
for an error but not while an action is pending. These commands are not agent-callable and
never start a run, grant consent, apply/discard changes or restore a checkpoint.

Panel buttons and palette/menu entries share these registrations. Titles exist in English,
German, Spanish, French and Brazilian Portuguese. The command inventory includes the
mount-time registrar. New-space and new-Studio menu entries only open forms; existing
confirmation and native revision/capability checks stay authoritative.

## Verification

Run from `phase1`:

```sh
npm run test:vibespace
npx tsx --test src/lib/shell/*.test.ts
npm run check:ui-commands
npm run check:commands
npm run check:layers
npx tsc --noEmit
VIBESPACE_SCREENSHOTS=/tmp/vibespace-shell node src/components/vibespace/shell-browser.mjs
VIBESPACE_SCREENSHOTS=/tmp/vibespace-legacy node src/components/vibespace/browser-fixture.mjs
```

The offline shell harness uses real panels, the existing canvas, shell context and registry
glyphs, with explicit fixture data. It checks navigation, inspector selection, attention
filtering, no native writes from shell navigation, browser errors and horizontal overflow.
It emits light and dark screenshots. Its outer layout is isolated test chrome, not a claim
that a native desktop window or the full application was tested. Production continues to
show the honest native-only notice in a browser.

Unit tests cover manifest validation, inspector visibility, default panel stacks, rail
customization/overflow, native-only Memory/Skills gating, stale ownership, command payloads,
reconciliation locks, registry disposal, panel content and five-locale parity.

The clean base and this branch both report the same full-typecheck blocker: generated
`slides-engine/pkg/somnia_slides.js` is missing in this checkout. No generated WASM artifact
or type stub was added to hide it. The layers gate passes but warns that its TypeScript
transpiler has not yet added TypeScript 7 support. Native desktop Memory/Skills writes,
full-app rail drag interactions and Windows window behavior were not exercised here.
