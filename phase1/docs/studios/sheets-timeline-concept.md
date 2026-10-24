# Sheets Studio - filter timeline concept (no code yet)

Written after the Filter-Slicer run (patches 0110/0111: slicer inspector section,
session-scoped filter mirror, protection awareness). This is a design concept for a
date-period filter view - what Excel calls a Timeline. Nothing here is committed
behavior; the first implementation slice needs its own go, and the Rust/core variant
(Path B) needs Philipp's explicit go.

## What a Timeline is here (naming honesty)

Excel's Timeline is a date slicer: a control that filters a table or pivot by a date
column using periods (years, quarters, months, days) instead of individual values.
Ours is an inspector section bound to one date column of the current selection or
table - a sibling of the Filter-Slicer, not a floating grid object. It is a view on
the normal AutoFilter; the timeline itself is never persisted to the file. Working
name: "Filter timeline". It is not Excel's Timeline object (no own part in the xlsx,
no pivot coupling) and must not be named as if it were.

## Engine reality (verified in code)

- FilterOp (protocol.ts) offers: custom (exactly ONE condition per column), values
  (picked display values, max 200), top, color, aboveAverage, clear/clearAll/off.
  A period is a range - `>= start AND < end` - and is NOT expressible with today's
  op set. This single fact drives the two-path split below.
- Dates are CellValue Numbers plus a date number format. `sheets.analyzeRange` /
  engine `range` return RangeCell WITHOUT style, so a plain analyze read cannot
  tell a date from a plain number. The styled read exists: engine `view` returns
  ViewCell with `style.fmt`, bounded by MAX_READ_CELLS = 10,000.
- Serial epoch: clock.ts pins the 1900 system (`EXCEL_EPOCH_OFFSET=25569`,
  1899-12-30). Only Date->serial exists today (`localSerial`); the timeline needs
  the inverse as a small pure helper, no date library.
- Readback: the slicer's mirror (slicerState.ts) is generic over FilterOp and can
  be reused unchanged - the timeline records its applied ops through the same
  single choke point (SheetsCanvas.applyFilter) and gets the same honest
  unknown/stale behavior for free.
- Protection: same 'autofilter' permission check as the slicer (slicerFilterAllowed).
- Scan bounds: same as the slicer - distinctValues is bounded at 10k rows / 200
  picks; the timeline reuses the 10k scan bound.

## Two implementation paths

### Path A - TS only, no core change

A picked period is applied as `filter kind:'values'` with the period's distinct
display values. Consequences, stated honestly:

- Bound by MAX_FILTER_PICKS = 200 values per apply. Year/quarter periods of real
  data usually fit; a month of daily dates fits (~31); day granularity over a
  long column does not. The UI must gate granularity on the actual distinct count
  per period and say why, not silently drop.
- Value identity is display text (that's how kind:'values' matches). Two dates
  displayed identically under the column's format are one value - correct for
  filtering, but it means Path A is format-dependent by construction.
- A column whose values are not dates gets a clear "no date values found" state,
  never a guessed filter.

Path A needs no Rust, no dependency, no new command id. It reuses analyzeRange for
the value scan (a `styled` option on that existing command's schema - preferred
over a new command id - if fmt-based detection is wanted at load time).

### Path B - one small engine op (Rust, Philipp's explicit go required)

Extend FilterOp with `{kind:'range';column:number;from:number;to:number}` -
numeric serial bounds, half-open `[from,to)`, bridge re-validates every field,
one undo step. This is the only variant that handles day-level data at any
cardinality honestly and is format-independent (compares serials, not text).
It is also generally useful beyond timelines: it is the missing "between"
filter for any numeric column.

Recommendation: build the timeline UI and period model on Path A first (T1), add
Path B behind Philipp's go (T2) and switch the apply path per period: periods that
fit Path A stay values-based (readable in the file's AutoFilter dropdown), range
op for the rest - or uniformly range-based once it exists; decide at T2 with CI
evidence. Do not start any Rust before the explicit go.

## UX

Inspector section "Filter timeline" (sibling of the slicer, order 19):

1. Column select over the selection's columns (same binding discipline as the
   slicer: binding is a user action, no auto-refresh per keystroke).
2. Load: one bounded styled read of the column (view op, <=10k cells). Cells with
   Number values are bucketed by serial; the column's fmt (first styled data cell)
   decides only whether the column is offered as a date column. If no date-like
   values are found, the section says so and stops - no heuristic guessing.
3. Granularity select: Year / Quarter (calendar quarters only - fiscal years are
   out of scope for v1) / Month / Day.
4. Period list with row counts and multi-select checkboxes, including a blanks
   entry; the list itself is bounded (cap ~500 periods, truncated flag shown
   honestly like the slicer's 200-value flag).
5. Apply (one undo step via the current path's op), Clear (kind:'clear'),
   readback line from the mirror (active / last-known-stale / unknown), protection
   hint and disabled states exactly as in the slicer.

## Period model (pure, testable)

A small module (e.g. `timelineOps.ts`), all pure and unit-tested without an engine:

- `serialToYMD(serial): {y,m,d}` - inverse of clock.ts's localSerial, same epoch.
- `bucketPeriods(serials, granularity): {key,label,count,from,to}[]` - sorted,
  locale-formatted labels via the existing i18n (month names already exist for
  the sort presets: `presetList('months')` shows the pattern).
- Bounds per period as serials, so Path B is a drop-in: the same bucket carries
  the `values` payload for Path A and the `from,to` payload for Path B.
- Granularity gating for Path A: `periodFitsValues(bucket): boolean` against
  MAX_FILTER_PICKS, with the honest disable reason for the UI.

## Model hygiene (house rules applied)

- No new core, no new dependency, no new command id on Path A. Prefer extending
  the existing `sheets.analyzeRange` schema (`styled` flag) over a new command if
  fmt detection is needed at load time; keep docs/ui-commands in sync.
- DS primitives only; 5 locales via panelI18n arrays; one undo transaction per
  user action via the existing filter op.
- Mirror reuse, no second state store: the timeline records through the same
  applyFilter choke point. A range op (Path B) needs one line in the mirror's
  describe function.
- Persistence: none for the timeline itself; the applied filter is a normal
  AutoFilter and round-trips through the file exactly like today.
- Collab: filter ops do not route through the collab binding today; the timeline
  inherits the slicer's behavior (remote peers see the row visibility result,
  not the timeline view state).

## Slice plan

- T1 (TS-only): period model + tests; inspector section with column binding,
  granularity, period list, apply/clear via kind:'values' with granularity
  gating, readback + protection + truncated states; i18n (5 locales); SSR and
  unit tests. Gates: sheets suite, check:ds/layers/ui-commands, scoped tsc.
- T2 (needs Philipp's go, Rust): FilterOp kind:'range' in protocol + bridge
  re-validation + engine apply, one undo step; TS schema extension of
  sheets.filter (existing command); mirror describe; engine-side tests run in
  CI only - locally unrun, labeled as such.
- T3 (polish, optional): table binding via TablesInfo (header from a real table
  instead of the selection-first-row assumption), relative periods ("this
  month") - each with its own go.

## Risks and honest limits

- Date detection can miss exotic custom formats; the section then reports "no
  date values found" on a column the user considers dates. Acceptable: explicit
  and recoverable (pick another column), never a silent wrong filter.
- Path A day granularity on high-cardinality columns is gated off by design;
  the honest answer to "filter these 3 days" on such a column is the Filter-
  Slicer (200 values) or Path B.
- No screenshot obtainable locally; Playwright E2E cannot run here (WASM
  bridges missing); Rust is CI-only.
