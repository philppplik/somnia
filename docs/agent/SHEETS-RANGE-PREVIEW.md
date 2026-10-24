# Sheets selected-range preview

Local sidepanel now selects a bounded range port when the current selection spans several cells. Up to100 visible/unmerged cells, displayed text only. Uses existing live range reader with worker epoch/current selection checks. Proposal values must exactly match rectangle dimensions, each field at most4096 UTF-8 bytes and total at most16384. Host permission and target checked again before stage. No model-selected coordinates or range widening.

Preview has before displayed cells and after input grid, reject only. No Accept or Undo is advertised. Native setRangeReviewed/undoRangeReviewed with exact old range/token and one native receipt is required before enabling execution. Existing setValues, although atomic, is NOT a substitute for reviewed stale checks/owner receipt. Pending preview blocks new turns, reject/stop/error/reset clears it.

11 targeted tests pass and1 actual panel Light/Dark browser test confirms preview/reject and zero Accept/Undo controls. Both screenshots inspected. Synthetic browser core, not native range receipt proof. Based on fetched integration tip containing Docs/Slides wiring; no other pending UI slices needed. No new deps/cloud/automatic apply. Builder follow-up is awaited via parent.
