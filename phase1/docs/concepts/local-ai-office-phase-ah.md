# Local AI for Office studios: concept and first safe slice

## Current integration audit

The existing Agent provider path supports Ollama with fresh local metadata/capability
checks, consent/context exclusion, explicit task/studio model selection and review.
Office builders own their UI, so this slice changes no Documents/Slides/Sheets UI.

studioWorkspace currently exposes Documents text and the selected Sheets cell as
read-only bindings with adapter:null. Neither has a reviewed native write adapter
in this path. They must remain read-only until builders supply revision-safe edits
and user review. Slides uses canonical deck-text-v1: deck_inspect reads bounded
canonical text, and deck_propose_changes stages partial text-run edits with identity/
revision checks. It does not apply/save or edit layouts/notes. Noncanonical decks
remain preview-only. DocumentCore/TransactionManager owns accept/undo, not the model.

## Suggested interaction

- Documents: rewrite only the explicitly selected text, or summarize selection.
  Return plain text. Host captures document identity/revision/selection and presents
  a before/after proposal. No adapter means copyable draft only, never a claimed edit.
- Slides: rewrite selected canonical text runs only. Host maps exact captured run
  IDs to the existing deck proposal path, never model-chosen slide targets. Notes,
  layout, images, URLs, external relationships and OOXML are excluded from this helper.
- Sheets: summarize an explicitly selected range of displayed cell text, without
  formula execution or writes. Range acquisition/limits are future builder work;
  current selected-cell state is not silently widened to a range. Formula values,
  hidden cells/sheets and credentials are not collected by this slice.

## Shared pure helper

buildOfficeLocalPrompt receives only explicit text entries and task/kind from the
host, rejects unknown/secret-bearing fields, control characters and oversized UTF-8
content. It performs no reads, inference, saved-state lookup, tools or mutation.
Selection data is labelled untrusted; it cannot authorize commands or new sources.
It returns plain prompt text plus bytes. Host still chooses a fresh exact local
model through the existing provider path, never cloud fallback by accident.

The input contract cannot detect a secret deliberately embedded in selected prose.
It prevents accidental credential/config/file/URL inclusion by accepting text only;
secret detection is not advertised. User review and source exclusion remain required.
Model output is untrusted draft, never executable code/formula or approval.

## Builder handoff and acceptance

Builders provide selection text extraction, identity/revision capture and approved
proposal adapters. Reject apply on selection/document/revision drift. Summaries stay
read-only. Rewrite output needs exact destination review and explicit accept with
undo; never save automatically. Keep prompt byte limits, output cap, consent, local
verification and scope tools from the existing path. Do not infer task/model from
selection words or add hidden history/custom prompts.

This slice supplies pure prompt prep/tests only, not an Office UI or provider call.
Native/Office end-to-end editing, formatting fidelity, formulas, selection extraction
and packaged acceptance remain open. No dependency, studio UI, inference or spend.

## Evidence for this slice

Three pure helper tests and 449 broad Agent/provider tests pass. Tests cover explicit
selection/multibyte caps, 100-entry bound, unsupported write task for Sheets,
unknown scope/secret-bearing fields, no mutation and injected selection instructions
remaining labelled data. DS, commands, UI inventory and layers pass at 1660/5961;
layers retains existing compiler/ignored/stale-baseline warnings. Unfiltered tsc
has only inherited missing generated slides-engine/pkg/somnia_slides.js. No Office
selection extraction, model inference, actual proposal creation or native/full app
E2E claimed. The helper's rules are defense in depth, not model compliance proof.

Roadmap-Delta: builders wire explicit range/selection capture and revision-safe
review adapters; add adapter/proposal/E2E evidence before exposing apply. Reject
binary/hidden/private source additions outside this helper's explicit contract.
