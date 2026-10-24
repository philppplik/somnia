# Ratchet proposal for integrated studio areas

Separate approval commit. Existing active ds-baseline.json and ds-hooks.json are unchanged.
The current integrated new-studio areas were absent when P0 took its baseline, so default zero budgets
correctly fail. Existing agent-area growth is a separate regression; it must not be folded into new-area enrollment.

Proposed workflow:
1. `node scripts/check-ds.mjs --propose-enrollment /tmp/ds-enrollment.json` emits only a review proposal.
2. Review each new area's every metric, raw-control ownership, inline/paint/content distinctions and source SHA.
3. Reject existingGrowth unless a separate explicit review resolves it. Preserve all old budgets/hooks/exceptions.
4. Integrator may approve one exact first-enrollment budget per new area in a separate reviewed baseline commit.
5. Every later `--update` accepts only reductions. Removed areas/metrics retain zero entries, preventing
   delete-and-reintroduce budget resets. New debt defaults to zero. No automatic rebaseline or growing budget.

Do not use --init, delete baselines, add broad exceptions or copy all current counts to make integration green.
The proposal command cannot overwrite active baseline/hooks and is not a pass or approval.
This patch provides proposal tooling plus the removed-area zero-retention fix; it does not approve current debt.
Existing thresholds and hook preservation remain unchanged. The integrator must pick approved enrollments,
and fix remaining agent growth, before claiming check:ds passes.
