# PDF layout UX research handover

Date: 2026-10-07

## Change

Documentation only. The report recommends an organizer-first PDF v1, drawing documented patterns from InDesign, Acrobat, Affinity Publisher 2 and version-qualified Scribus sources. It distinguishes repeated overlays from linked parent pages, native stories from PDF text, and basic document checks from production certification.

Files:

- `docs/research/pdf-layout-ux.md`: comparison, concrete interaction contracts, scope, acceptance checklist and open decisions.
- `docs/research/pdf-layout-ux-sources.md`: claim/source ledger and retrieval limits.
- This handover.

## Integration

Base: `427f8dbd2478d361b544a8cf81c4fd9dc0b7b631` on `somnia-agent`.

Feature branch: `docs/pdf-layout-ux-research`.

Apply the supplied format-patch using `git am`, or fetch the supplied Git bundle and cherry-pick its single commit. The central builder owns integration. There was no push, PR or CI trigger.

Do not treat the report as an implementation or as a license verdict. Coordinate operation gates and preservation fixtures with the parallel PDF-engine research before offering features in the app. No duplicate engine investigation was done.

## Validation

- Base HEAD matched the requested commit before branching.
- Markdown source and source ledger inspected for structure, citations and explicit recommendation/evidence boundaries.
- `git diff --check` must pass before packaging.
- Documentation only: no dependencies changed, no executable code, no new tests. `test:core` not run because this change cannot exercise runtime behaviour. Proposed future tests fit the existing node:test suite.
- No rendered UI/PDF or competitor screenshot verification was performed. This is manual-based interaction research.

## Open

Approve organizer-first scope; settle supported operations with the engine research; test PDF structure preservation, protected/signature handling, coordinates, font coverage, large/corrupt inputs and actual platform UI. Native parents, stories and production preflight need separate persistent-model milestones. Version-current Scribus/Affinity replacement-product behaviour remains unverified where public help was incomplete.
