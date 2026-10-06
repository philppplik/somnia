# Large project indexing (v11 branch)

Base: phase1-foundation, 10c6989 (v10.1.0). No release version change.

## Shipped in this branch

- Raise eager text-document capacity from 64 to 2,048 in both the adapter and native document service. Keep the native 8 MiB per-file cap.
- Folder reads use eight workers and yield after every 32 completions. All workers settle before a failed candidate is closed. The old project remains connected until candidate listing, reading and model validation succeed, and edits made during opening still abort replacement.
- Parse the candidate model once and reuse it on attach (previously the validated model was discarded and rebuilt).
- Web indexing supports 32 directory levels (previously files below level 8 were silently omitted). It rejects excess depth, more than 20,000 indexed entries, more than 2,048 editable documents, or more than 64 MiB of decoded UTF-8 project text. No partial project is attached. Non-editable assets do not count toward the document budget. Existing hidden/generated-directory exclusions remain.
- File rows are memoized and virtualized with fixed 32px height, eight overscan rows per side, ResizeObserver measurement, and focused-row retention. Home/End and up/down can reach files outside the mounted viewport. No App.tsx, locales, capabilities or build.rs changes.

## Validation

`npm run test:core`: 333 passed. `npm run build`: passed (existing bundle-size/dynamic-import warnings remain).

System Chrome on Linux: four targeted Playwright tests passed (1,000-file OPFS folder, existing file create/duplicate/rename/delete, existing web folder edit/save, project search/replace/undo). The large-folder test opens the last file, verifies saved bytes on the browser filesystem, checks bounded mounted rows, exercises Home/End across the virtual list, and captures a screenshot. Only the directory picker is replaced; reads and writes use Chromium File System Access handles.

Screenshot inspected: list at page-0999.html, selected row, source editor, live preview and on-disk/saved indicator. Rows are readable, contained in the sidebar and not overlapping. Windows desktop and native file-service tests were NOT run: Rust/Cargo is absent from the validation environment. A native 1,000-document read/last-file-save regression is included for CI.

## Benchmark

Run `cd phase1 && npm run bench:projects`. Reproducible fixtures: 64 / 256 / 1,000 / 2,048 HTML files, 20 sections per file, one warmup and five measured samples, 1 ms simulated read latency. The report records raw samples and machine details in `phase1/validation/bench/projects.json`. Budgets: p95 index <100 ms, simulated reads <2 s, model parse <5 s. These are local regression guardrails, NOT promises of Windows disk or application startup speed. No benchmark creates actual user files.

The checked-in report contains this run's measurements. Synchronous eager parsing remains the main long task at 2,048 files. This branch is not lazy-loading or a worker-based parser; projects beyond the explicit budgets still fail clearly. Search, whole-project undo snapshots, draft persistence, preview asset handling and memory use for large real-world HTML need further profiling. Do not advertise unlimited project size.

## Integration

Minimal conflict-sensitive adapter changes: import readProjectDocuments, optional prevalidated model in attach, bounded candidate reads, and pass candidate to attach. Native service changes only MAX_DOCS. Cherry-pick/review these carefully if another swarm modified fileAdapter.ts.
