# DJ: explicit search and download recovery

Status: **In development**. Search-only scope unchanged.

After a search model/binding/source failure, the search panel offers a nearby setup-review action and localized recovery instructions in all five locales: refresh runtime; review exact missing-model download or explicitly start stopped runtime; review sources and consent; rebuild. This opens review only. It never retries, downloads, rebuilds or routes to cloud automatically. Generic binding failure does not claim to distinguish model deletion from daemon loss without a fresh setup inventory.

Model-action errors now distinguish delete, pull and launch. A pull failure no longer displays the delete-identity error. It directs the user to job status, runtime refresh and fresh disk/acknowledgement review. Existing categorized disk/permission/integrity/registry errors remain fixed localized messages; raw daemon text is not rendered. Existing interrupted-job review starts a new exact-model pull; partial layer reuse and daemon cancellation remain unknown, not a byte-offset resume promise.

Four production-host synthetic browser regressions cover missing model and stopped daemon after a ready build, with no query embedding/old index and fresh consent required; disk-full stream and cancel-unknown release, each with review-again resetting acknowledgement/disk and Confirm still disabled after acknowledgement alone. No second pull or auto-embedding. The production default manager, runtime, setup, session and adapter are unchanged at transport-policy boundaries. Unknown synthetic native/HTTP routes are refused.

Validation also retains DH full-chain light/dark, model-manager tests and five-locale key/placeholder parity. Pixels inspected at1120px for missing/stopped recovery and fresh retry-review. Actual native download/disk-full/cancellation/daemon shutdown and model quality remain CI/manual acceptance gates. No dependency/budget change or real download/inference.
