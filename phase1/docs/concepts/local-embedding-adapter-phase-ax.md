# Guarded Ollama embedding adapter (AX)

Search-only first milestone, no generated answers. Exact embeddinggemma:300m,
optional separately reviewed download, explicit selected open text only, memory-only
future index. This phase implements transport/contract wiring, not source picker,
build/query orchestration or search UI. Tests use synthetic responses, no install,
user data transmission, real inference or paid operation.

HTTP loopback origin only, redirect:error, fresh inventory/digest and local weights/
embedding capability before content transmission, fresh digest after response.
No retries, auto-download, cloud fallback, /api/chat or saved credentials. Exact model
must already be installed, tag isn't accepted as proof. Request /api/embed with
truncate:false. No automatic dimension reduction. Response model/count/dimensions,
finite bounded nonzero vectors and response size checked. Timeout/abort covers body
consumption; no late success accepted. Local endpoint/daemon evidence isn't egress
attestation. Daemon may still lie/proxy or change between checks.

Batch transport consumes explicit text array only, max 32 inputs/4096 bytes each/
128 KiB total, and expected model digest/dimensions. Adapter can embed AT-prepared
chunk projections into AU frozen vectors while preserving AS descriptor; source
hash/pipeline mapping checked locally before any embed. Remaining atomic build/
query generation/source recapture belongs to next phase. No storage or UI here.

Source API contract: https://docs.ollama.com/api/embed and
https://docs.ollama.com/capabilities/embeddings, fetched 2026-10-14.
Vendor says truncate:false errors on over-context input, /api/embed returns
embedding arrays. This is vendor behavior, not local runtime compatibility proof.

Six focused and 510 Agent/provider tests pass: exact guarded request sequence,
truncate:false/redirect:error/frozen vectors, no text on remote/missing capability,
post-response digest drift, malformed/count/dimension/zero/value vectors, generic
errors, pre-abort/caps/no I/O, header/body timeout, AT source/chunk/revision hash
binding and forged text refusal. DS/commands/UI inventory/layers pass with existing
compiler/ignored/stale caveats; unfiltered tsc only missing generated Slides bridge.
No real Ollama inference/runtime-version compatibility, native/full-app E2E or
source-picker/search UI claimed. Fetch is renderer transport like current Ollama
chat: native no-proxy transport parity/packaged CSP remains a follow-up validation.
