# Local search: privacy and limits checklist

Status: **In development**. Review checklist, not completed acceptance. Every box starts unchecked.

Use this before handling sensitive text or publishing a release claim. Record the exact integrated build, device/runtime/model digest, reviewer/date and evidence or gaps for each box. A missing observation remains unknown. Use non-private fixtures for tests. See the [acceptance checklist](LOCAL-AI-ACCEPTANCE.md) for steps.

## Source and request scope

- [ ] Only explicitly selected, eligible already-open `.txt`/`.md` buffers are offered. No hidden/config/binary/closed files, folder crawl or nested-folder grant.
- [ ] Source names/excerpts and full-text disclosure are clear before consent. Full selected text is embedded, not just the displayed excerpt.
- [ ] Selected raw/normalized byte, file and chunk limits are enforced whole. No silent truncation or expanded scope.
- [ ] Exact model digest/capability/local metadata is checked at the request boundary. Record physical execution locality as unknown when metadata cannot prove it; loopback is not proof.
- [ ] Actual source/query requests stay on the approved local route. No silent cloud fallback, generated answer, tool action or private context expansion.

## Setup and shared runtime

- [ ] Opening search/setup performs no automatic download or build. Runtime/hardware checks and model start are explicit.
- [ ] Download review covers exact tag, terms/use restrictions, registry network access, size estimate, selected volume and fresh acknowledgement/Confirm.
- [ ] Selected-volume capacity is not described as daemon storage identity or reserved space. Hardware fit is not quality, isolation, allocation or speed proof.
- [ ] Cancel reports owned request/index outcome separately from unknown shared daemon work. Review retry starts a newly reviewed pull, not promised byte-offset resume.
- [ ] Missing/replaced model or stopped daemon clears stale search state and requires explicit review/consent/rebuild. No automatic retry.

## Results, session and accessibility

- [ ] Literal snippets and citations stay untrusted text, never instructions or permission. Semantic similarity/cutoff is not factual confidence.
- [ ] Top-k omissions, per-source coverage and unsupported raw offset mapping are stated. Source-only open never claims a selection.
- [ ] Close, clear, source/model/project changes discard the app-owned memory index and results. Inspect app storage/request traces for unintended index/query/source writes; record uninspected boundaries as unknown.
- [ ] No app disk index, query history, background indexing or export exists in this workflow. Do not promise forensic deletion from OS swap, daemon logs, crash reports or other processes.
- [ ] Logging/diagnostics/screenshots used for QA contain only non-private fixtures and redacted identifiers. Raw source/query/daemon exception text must not leak through error UI.
- [ ] Keyboard focus, status announcements and labels are checked in all five locales and both themes. Actual screen-reader speech/native editor behavior has device evidence or is explicitly unverified.

## Release statements

- [ ] Published copy says In development until release evidence supports another label. Synthetic fixtures do not establish native/CSP/model/privacy acceptance.
- [ ] Real-model quality and performance claims have independent labels/input receipts/model/version/device evidence, not oracle vectors or metadata.
- [ ] Generated answers, persistence and cloud routing are not introduced by this checklist or inferred from search approval.
- [ ] Failures, skips and unknowns remain visible in the release decision. An unchecked item is not a pass.

No checks have been completed by creating this document. Read the [short user overview](../guide/ai-and-collaboration.md#local-search), [workflow guide](../guide/local-source-search.md), [known limits](../guide/local-source-search.md#development-limits) and [milestone status](LOCAL-SOURCE-SEARCH-MILESTONE.md).
