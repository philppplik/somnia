# A8 - Multi-agent task board

Status: implemented against `int/vibe-wave` (A3 scheduling + A5 studio/review integrated).
Concept contract: `docs/concepts/vibespace.md` section 3.6.

## What it is

The board is the multi-agent view of one Vibe Space: several independent, isolated
runs in parallel, each on its own card, grouped into columns that map to **run
state**, not user labels:

| Column | Core run states |
|---|---|
| Draft | `draft`, plus studios (sessions) that have no run yet |
| Running | `running`, `paused` |
| Needs you | `needs-you` (held consent requests) |
| Ready | `ready`, `done` (review waiting, incl. conflict state) |
| Applied / Failed | `applied`, `discarded`, `failed`, `crashed`, `stopped` |

Each card shows the live last-step line (failure message and pending consent
reason take precedence), the model badge, elapsed time, reported cost, the review
size ("N files changed") and the conflict badge. Consent details, hunk review,
apply/discard and transcripts stay in the existing Studio detail view (A5); the
card is the entry point.

## Ownership: one runtime, the board only reads and steers

- The board derives every state with the existing `studioState()` from the core
  wire projection. There is **no second state machine** and no board-side run
  bookkeeping (`boardProjection()` is a pure function of the snapshot).
- Control leaves the board as plain `VibeIntent` data (`stop`, `steer`, `start`)
  and is dispatched by the single `VibeSpaceController` that owns the native
  connection (A1). The board module and view contain no transport, no `invoke`,
  no native command name; a unit test asserts this ownership boundary in source.
- Consent, review, cost, stop and steer stay **independent per run**: every
  intent carries the exact `runId` of the card it was fired from, and the
  controller's existing gates (capability, consent scope, review revision,
  conflict) apply unchanged. The e2e proves steer/stop hit the right run and
  that stopping one run never touches another run's controls.
- **No auto-merge anywhere.** Runs with conflicts are surfaced with a
  "compare needed, no auto-merge" badge; resolution stays the explicit
  review/new-run flow from A5.

## Usage aggregation (A10 contract)

`aggregateUsage()` totals token and cost fields across the visible runs with
option-field semantics:

- A run that did not report a field makes that aggregate field **unknown
  (`null`), never zero**. The board labels it "Not reported" and shows a partial
  notice ("N of M runs reported").
- Cost is only the sum of provider-reported amounts. A cloud run without a
  reported cost, or a `provider_reported_partial` source, marks the total
  incomplete (`partialCost`) instead of silently reading as free. Local-model
  runs are known-free and do not gap the total.
- No cost is ever estimated or invented.

## Scheduler time axis and conflicts

The board lists the space's schedules (A3) with their next fire time. Only
verifiable collisions are flagged - nothing is predicted:

- **same-slot**: two enabled schedules of one Studio fire at the exact same time.
- **active-overlap**: an enabled schedule is due while a run of its own Studio is
  still active (the core cannot start a second run of that Studio until
  `canStart`).

Schedules on different Studios never conflict: runs are isolated and parallel by
design. Disabled schedules are listed and marked "Off". If the native schedule
read fails, the board says so ("Schedules unavailable") instead of showing fake
data; live runs are unaffected. The strip loads on mount; it does not poll.

## Files

- `phase1/src/lib/vibespace/board.ts` - pure projection: columns, concurrency
  summary, usage aggregation, schedule conflicts.
- `phase1/src/components/vibespace/BoardView.tsx` - board UI (cards, columns,
  summary, schedule strip); mounted by `VibeSpaceHome`.
- `phase1/src/locales/vibespace/board/{en,de,es,fr,pt-BR}.json` +
  `phase1/src/lib/vibespace/boardI18n.ts` - own catalogue, five-locale parity.
- Tests: `board.test.ts` (projection/aggregation/conflicts/ownership),
  `boardLocales.test.ts` (i18n parity), `board.test.tsx` (render),
  `tests/vibespace-board.spec.ts` + `scripts/vibespace-board/` (e2e).
- Styles: `vs-` classes appended to `vibespace.css` (stub convention).

## Known limits (alpha)

- Pause/resume intents are not part of the card controls yet; the detail view
  shows them disabled honestly (A5 gap, unchanged).
- Cross-artifact review rendering (docs, sheets, slides previews) lives in the
  A5 detail view; the board only summarizes file counts and conflicts.
- The schedule strip does not live-refresh after a new schedule is saved from a
  dialog; it reflects the last native list read on mount.
