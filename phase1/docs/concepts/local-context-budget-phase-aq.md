# Inspectable local context budget (AQ)

The visible source estimate bytes/4 is not tokenization and omits complete history,
system framing/tool schemas and later tool results. A pure report now shares the
actual existing request guard's conservative accounting: serialize text messages
and tools to JSON, count UTF-8 bytes, reserve requested output + 256 framing tokens,
one byte per remaining token. Unknown context stays unknown; invalid/exceeded do
not fit. Exact bytes/remaining/overflow can support a future explanatory UI.

No automatic history trimming, tool removal, text truncation, context increase,
model-family prompt template guessing or provider change. This report is for the
complete final request supplied by its caller. Earlier estimates do not include
later source/tool additions. Guard is checked again at provider request time.
Ollama already caps effective output to context/4: report callers must pass the
same final effective request to compare enforcement, not an unrelated UI draft.

Images remain separately unknown: binary image bytes aren't counted as text,
so text fits does not mean full multimodal request fits. Daemon may clamp/truncate
context, tokenizer/prompt formatting/KV-cache are not measured or proven. 256 is
heuristic framing reserve, not a known chat template. Final capacity/quality remains
unverified. Report itself does not authorize sources or guarantee secret detection.

Roadmap-Delta: reusable inspectable guard report, no UI/runtime behavior expansion;
future UI uses final-request facts, while native/model/tokenizer/multimodal and
packaged evidence remain open. No dependencies, reads, inference or spend.
