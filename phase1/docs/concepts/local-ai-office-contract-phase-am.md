# Office builder handoff contract (AM)

Pure companion to AH's prompt builder. No Documents/Slides/Sheets UI, source reads,
provider calls, apply/save, adapter registration, storage or dependencies.

Builder steps:

1. Extract only the user-selected text. Capture host document identity, numeric
   monotonic revision, selection identity and ordered stable text target IDs using
   captureOfficeSelection. Documents builders define exact selected spans; Slides
   builders supply canonical text-run IDs; Sheets supply only explicitly acquired
   displayed-cell targets. Never infer a range from current selected-cell state.
2. prepareOfficeReview reuses AH's prompt limits/task restrictions. Invoke the
   existing consent/context/fresh verified-local provider path separately. The
   helper does not establish privacy, local model quality or budget compliance.
3. createOfficeReviewProposal takes ordered plain text output, never model-chosen
   targets. Rewrite requires one output per captured target; summaries one output
   and zero replacements. Sheets only summarize. Objects/snapshot/targets are
   cloned and frozen. Extra metadata and invalid/oversized text fail closed.
4. Show before/after and exact destinations for user review. All proposals are
   awaiting-review, applied:false, adapterRequired:true. These are DTOs, not native
   executable proposals. They grant no approval or adapter capability. Documents
   and Sheets remain adapter:null today; rewrite there is copyable draft only.
5. Immediately before acceptance, builders call assertOfficeSelectionCurrent with
   a new trusted host capture inside their atomic transaction, then validate native
   identities/targets and explicit acceptance. Identity, kind, revision, selection,
   target ID/order/text drift requires fresh capture, generation and review. A check
   at proposal creation is not a lease or protection from later changes. Builders
   own transaction failure, undo, formatting fidelity and native proposal mapping.

Revision cannot be omitted or inferred from prose. Hosts without trustworthy
revision/selection evidence must not fabricate it to enable acceptance. IDs are
opaque host handles, not paths to read or URLs to follow. Selected secret prose
cannot be detected here. Model output is untrusted plain text, never executed as
code/formula. No token-truncation claim: AH's outputLimit remains provider guidance;
this contract independently enforces byte caps, not a tokenizer.

Roadmap-Delta: shared builder-facing capture/prompt/review/drift DTOs now available.
Native builder adapters, real selection extraction, acceptance/undo, formatting,
Ollama inference and packaged Office E2E remain unimplemented and unverified.
