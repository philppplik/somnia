# Explicit machine/task candidate ranking (AO)

Pure candidate ranking only. No download, installation, selection persistence,
provider call, hardware probe or UI. Chat/summarize use existing reviewed small
catalog tags; code includes the catalog coder candidate. Embed requires separate
embedding metadata and adapter, never repurposes the chat provider.

Host supplies fresh explicit available RAM and optional free discrete VRAM facts.
No total-RAM substitution, RAM+VRAM addition, unified-memory double counting or
summing multiple GPUs. Unknown/lower-bound VRAM cannot prove a full fit. Model
size is an estimate, not pinned weights, quantization/KV-cache/context or speed.
Required memory uses existing weights*1.25 + 1 GiB heuristic, with 25% margin for
likely. Ranking groups likely before tight before unknown before too-big, then
smaller estimated weight first. This is memory-first order, not a quality score.
No automatic recommended winner when facts are absent/stale or fit is marginal.

Roadmap-Delta: reproducible task/memory candidate shortlist, honest unknowns;
model-specific benchmark, exact installed digest, metadata/locality/fresh capability,
consent and embedding adapter work remain required before use.

Embedding candidate source: https://ollama.com/library/embeddinggemma:300m,
fetched 2026-10-14, declares embedding role and Ollama >=0.11.10.
https://ollama.com/library/embeddinggemma:300m/blobs/0800cbac9c20 lists 622 MB
BF16 weights. 622,000,000 bytes is a rounded vendor-size estimate, not an exact
artifact size or pinned digest. No vendor quality/benchmark claims adopted.
Not added to downloadable picker catalog; Gemma licensing/availability and exact
installed metadata require review before any future download/use. Text candidates
reuse localModelAdvice catalog estimates, not fresh benchmark evidence.

Fit is scoped to supplied pools. 'too-big' means these known eligible pools are
insufficient, not a machine-wide impossibility or a statement about unreported GPU.
Unified VRAM never substitutes for missing available RAM. Free discrete VRAM must
explicitly be non-unified/non-lower-bound to count. Caller chooses the exact GPU;
multiple-GPU allocation/offload is not modeled. Unknown facts remain unknown.
Five focused tests cover all task tags, exact fit/age boundaries, separate pools,
unified/lower-bound unknowns, no additive pooling, strict facts and immutable output.
