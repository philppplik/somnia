# Local models 4/4: vision and tool-calling models

Status: concept proposal, awaiting review. Nothing here is built. Nothing was run against a real
Ollama daemon, so every claim about model behaviour is marked as unverified.

Scope of this slice: capability detection, which Somnia features can use local vision and
tool-calling models, prompt and tool-schema compatibility, quality gates, and honest limits.
Model list and install UX, text chat tuning, and voice are covered by the other local-model concepts.
This file only states what it needs from them (section 9).

## 1. Ground truth in the repo today (verified on `int/shell`, 315d1f2)

| Fact | Where |
|---|---|
| The provider contract is text only: `AgentMessage.content` is a `string`, there is no image part. | `src/lib/agent/types.ts` |
| `OllamaProvider.stream` sends `tools` when the request has any, and never sends `images`. | `providers/ollama.ts`, `toOllamaMessages` |
| Tool results are mapped with `tool_name`, resolved from the earlier call id. | `toOllamaMessages` |
| Capability data is not read. `listModels()` uses `/api/tags` (size, details). `verifyLocalModel()` calls `/api/show` but only checks locality (`model_info` present, no `remote_host`). | `providers/ollama.ts` |
| A model without tool support surfaces as `ProviderError('http')` with Ollama's 400 text. Nothing detects this beforehand. | `docs/agent/ollama-provider.md`, assumption 5 |
| Tool history sends arguments through `safeParse`: unparsable JSON silently becomes `{}`. | `toOllamaMessages` |
| The session loop allows 16 steps and 48 tool calls per turn, offers no tools on the last step, and returns one fixed text when a tool fails: "Tool denied or failed. Check authorized paths...". The model never learns why a call failed. | `session.ts` |
| Tools carry a level (`read`, `propose`, `execute`). Only `read` and `propose` are on by default, and grants bind to `toolSchemaHash`. Local models must stay inside this. | `toolRegistry.ts` |
| Studio tools exist per studio (Photos `raster_*` and develop tools, Sound, command-generated `cmd_*`, a studio MCP server and host). | `photoStudio.ts`, `soundStudio.ts`, `commandTools.ts`, `studioMcpServer.ts` |
| Photo tools deliberately never return pixels or URLs ("No pixel references/URLs in serialized context or provider tool results"). Photo previews are capped at 4 megapixels. | `photoStudio.ts` |
| `docs/agent/decisions/PROVIDER-ARCHITECTURE-UX.md` already plans `ModelDescriptor` with capabilities as true/false/unknown plus a source, listing `vision` and `tools`. Ollama is to feed it from `/api/show`. | that file, sections on discovery |

Consequence: today a local vision model cannot be used at all, and a local tool model is used
blind (it works or the user sees a raw 400). This concept closes those two gaps.

## 2. Capability model

Reuse the planned `ModelDescriptor.capabilities` (true / false / unknown, each with evidence).
Add the evidence kinds below. A capability the user relies on is never shown as plain "supported"
if the only evidence is a declaration.

| State | Meaning | Badge |
|---|---|---|
| `verified` | Somnia's own probe passed on this model digest (section 2.2) | solid |
| `declared` | Daemon or model metadata says so, no probe yet | outlined |
| `failed` | Probe failed or the daemon rejected the capability | struck through, with reason |
| `unknown` | No evidence | grey |

Capabilities tracked by this slice: `vision`, `tools`. Also recorded for display and routing:
`thinking`, `contextLength`, `parameterSize`, `quantization`. Text-only is the default and needs no badge.

### 2.1 Declared evidence (cheap, automatic, on model selection)

1. `POST /api/show` has a `capabilities` array (added to Ollama in PR 10066,
   https://github.com/ollama/ollama/pull/10066, which also derives `vision` from a
   `vision.block_count` key). Read it first. Unverified: the minimum daemon version, and whether
   every entry such as `tools` exists on all versions. Read `GET /api/version` (already used by `health()`)
   and show "daemon too old to report capabilities" instead of guessing.
2. Fallback when the array is missing: `vision` is `declared` if `model_info` has a key ending in
   `vision.block_count` or `details.families` lists a projector family (for example `clip`).
   `tools` is `declared` only if the chat template text from `/api/show` references tools.
   These are heuristics. They are labelled `declared (heuristic)`, never `verified`.
3. `model_info` also carries the architecture context length (key `<arch>.context_length`).
   Show it as the model maximum. It is not the context the daemon will use (section 6, item 4).

The existing `verifyLocalModel` already makes this call. Merge both into one `inspectModel(model)`
that returns locality and capabilities from a single `/api/show`, so locality gating cannot be
bypassed by the new code and the daemon is asked once.

### 2.2 Probes (opt-in, a "Test model" button, cached per digest)

Probes cost load time and tokens, so they never run automatically. Result cache key: model digest
(from `/api/tags`) plus Somnia probe version. A new digest invalidates the result.

Tool probe, three fixtures, each a fresh request with one or two tiny tools:

- T1 call: "Use `echo` with text 'ok'". Pass: exactly one call, name matches, arguments validate against the schema.
- T2 choice: two tools, one relevant. Pass: picks the right one, no call to a name that was not offered.
- T3 round trip: after a tool result is sent back (using the real `tool_name` mapping), the model answers in text and does not call again.

Pass rule proposed: 3/3 fixtures, repeated 3 times at the temperature Somnia uses. Any fail gives
`failed` with the fixture id. These thresholds are starting hypotheses, not measured values.

Vision probe, generated in code (no bundled assets, no user data):

- V1: 256x256 image, a red square on white. Question: which colour is the square. Pass: answer contains "red".
- V2: a 256x256 image with the word "SOMNIA" rendered large. Pass: normalized text contains "somnia".
- V3: two shapes side by side (circle left, square right). Pass: names the left shape correctly.

Honest note: a pass shows the vision path works end to end (images reach the model, the projector
is loaded). It does not show the model can read a screenshot of a dense UI. The badge tooltip says that.

## 3. Which features can use which model kind

Ratings are by design fit, not measured quality. "Gate" refers to section 5.

| Feature | Local tools model | Local vision model | Notes |
|---|---|---|---|
| Agent chat, Code studio (read file, propose file change) | Yes, gated | Optional (screenshot of preview) | Existing `read` and `propose` tools. Review per hunk stays the safety net. |
| Documents, Sheets, Slides (structured propose tools) | Yes, gated, with a reduced tool set | Later | Fewer tools per request (section 4.2). Sheets formulas are easy to get subtly wrong: proposals only. |
| Photos studio, develop and raster tools | Yes, gated | Yes, new read path (section 3.4) | Today the model cannot see the image. With vision it can propose adjustments from what it sees. |
| Design and Vector studios | Yes, gated | Yes, screenshot of the canvas | Same screenshot path as Photos. |
| Sound studio | Yes, gated | No use | Audio understanding is a voice-slice topic. |
| Video studio | Tools only (timeline commands) | Not in v1 | Needs frame sampling, a cost and latency problem, see 3.5. |
| MCP and external tools | Only after the model passed the gate, and only tools the user enabled | n/a | Third-party tool descriptions are untrusted text. See 4.4. |
| Vibe Space (autonomous runs) | Not recommended | Not recommended | Long autonomous loops multiply small-model error rates. Keep cloud or explicit opt-in with a warning. |

### 3.4 Vision input contract

Types (frontend, no UI imports):

```ts
export interface AgentImagePart { mime: 'image/jpeg' | 'image/png'; base64: string; width: number; height: number; label: string }
// AgentMessage gains: images?: readonly AgentImagePart[]   (user role only in v1)
```

Rules:

- Images are attached by an explicit user action ("Attach canvas", drag an image into the chat) or by
  a `read` tool the user granted (3.4.1). Never silently.
- Provider mapping: Ollama gets `images: [base64...]` on the user message (documented in
  https://docs.ollama.com/capabilities/vision and https://github.com/ollama/ollama/blob/main/docs/api.md).
  A provider that cannot take images throws a typed error before any request; the contract gets a
  `supportsImages` flag instead of dropping images silently.
- Preparation in `lib/` (pure): longest side capped (default 1024 px, setting), re-encoded to JPEG
  (PNG only for small flat images), metadata stripped, hard byte cap per image, at most 4 images per request.
  The best size per model is unverified. Some models resize internally. Treat 1024 as a starting value to tune with the eval set.
- Privacy: an image sent to a local model counts as local processing only if `verifyLocalModel` passes
  for that exact request. Any other result uses the existing cloud consent path with the exact payload.
  The image-bearing session snapshot is not persisted by default (snapshots must not hold base64).
  This keeps the existing rule that serialized context carries no pixel data.
- Context cost: images use context tokens, and the amount depends on the model. Unverified. Because
  `num_ctx` is currently optional, a vision request must pass an explicit `numCtx` or the daemon default
  may silently truncate the prompt (assumption 6 in `ollama-provider.md`).

#### 3.4.1 `raster_look` and `canvas_look` read tools

The Photos tool set stays pixel-free for text tools. Add one separate read-level tool per studio that
returns a prepared downscaled render with a visible "image sent to the model" entry in the activity log.
Open point: whether an Ollama `tool` role message accepts `images` is unverified. Safe design: the tool
result text says "image attached", and the session appends the image as the next user-role message. Test
this against a real daemon before building on it.

#### 3.4.2 Two-model pipeline (recommended default)

Many users will have one good small tool model and one separate vision model. Do not require one model
to do both. A `describe_image` read tool calls the vision model (user picks it in Settings > AI > Local)
and returns plain text (max 600 tokens: subject, text found, layout, obvious problems). The tool model
works only on text. Benefits: the tool model stays within its comfort zone, and the vision model needs
no tool support. Cost: two models in memory or a reload on every switch. Unverified: how Ollama
schedules two models on consumer GPUs. Show a hint when both do not fit (VRAM data is the model-list slice's job).

### 3.5 Video studio

Video understanding with a local vision model means sampling frames (for example one per scene or
every N seconds), one image per request, and merging text. That is slow, memory hungry and, for small
models, unreliable on motion and timing. Recommendation: v1 gives the video studio tool-calling only on
the timeline commands (split, trim, move, title cards, gain). A "describe this clip" feature is a
separate later proposal after the Photos path has real eval numbers. Frame sampling would come from the
video studio's own decoder, and the model never sees whole files.

## 4. Prompt and tool-schema compatibility

### 4.1 Tool schema lint (pure function, run when tools are assembled)

`lintToolForLocal(def: AgentToolDefinition): { tier: 'simple' | 'ok' | 'complex'; reasons: string[] }`

- `simple`: flat object, primitives, enums, `required`, `additionalProperties: false`.
- `ok`: one level of nested object or an array of primitives.
- `complex`: `oneOf`/`anyOf`/`allOf`, `$ref`, arrays of objects, nested depth over 2, more than 8 properties,
  description over 400 characters.

Small models usually do worse as schemas get more complex, but where the line sits is unverified. The
lint is a configurable heuristic and the eval set (section 5.2) decides the real limits.

The lint does not rewrite schemas. A rewritten schema would change `toolSchemaHash` and invalidate the user's grants.
The lint only decides what to offer.

### 4.2 Tool-set policy for local models

- Default: offer only tiers `simple` and `ok`. `complex` tools are hidden for local models and shown in the UI
  as "needs a stronger model" with the lint reasons.
- Cap per request (setting "Tools per request", default 8 for local, unlimited for cloud). Selection: tools of
  the active studio first, then global read tools. Selection is deterministic so the same input gives the same tool set.
- Many `cmd_*` tools are generated from command specs. Offering them all to a small model is the likely failure mode.
  Unverified how many tools exist per studio today (not counted for this proposal). Count them in step 1 of the plan.

### 4.3 Prompts

- Keep the system message short for local models. Put studio context as a compact structured block, not prose.
- State the tool rule once: "Call a tool only when needed. After a tool result, answer in plain text." This targets the loop failure in T3.
- Do not combine `format` (structured output) with tools in the same request. Unverified whether Ollama supports it
  on all models. Use `format` only for single-shot helpers such as `describe_image`.
- Thinking models: keep the existing retry that doubles the output budget when a turn ends with `length` and no
  output. Hidden reasoning text must not be shown as an answer or stored in the session history.

### 4.4 Error feedback for malformed calls (change to session behaviour)

Today any tool failure returns one fixed sentence. For local models a repair loop needs a useful hint.
Proposal: for argument-validation failures only, return a message built by Somnia from its own schema
validator, such as `{"error":"invalid_arguments","tool":"raster_crop","problems":["width: expected integer >= 1"]}`.
That text comes from Somnia's schema and the model's own arguments, never from host callbacks or file
content, so it keeps the existing rule against forwarding private errors. Permission failures keep the fixed text.
Cap at one repair attempt per call, and it still counts against the 48-call limit.
Separately: `safeParse` turning bad JSON into `{}` should become an explicit validation error, otherwise a model
that sent broken arguments appears to have called the tool with nothing.

Third-party MCP tool names, descriptions and results are data, never instructions. A local small model is
more easily steered by injected text than a large one, so for local models MCP tools stay off until the
user enables each tool, which the existing per-tool approval already supports.

## 5. Quality gates

### 5.1 Model gate (per model digest and feature)

A model gets "Agent tools" only after the tool probe is `verified`. Without it the toggle still works
but shows "unverified, may fail" and the first failure shows a clear message pointing to the probe.
Vision features need the vision probe likewise. No gate ever changes what a tool is allowed to do. Gates decide only whether it is offered.

### 5.2 Eval set in the repo (opt-in, never replaces existing tests)

- Location: `phase1/test/local-models/` (fixtures) and `phase1/scripts/eval-local-models.mjs`.
- Runs only when `SOMNIA_OLLAMA_EVAL=1` and a daemon answers on loopback. It is not part of `npm run test:core`.
  Existing tests are not edited or relaxed. Mocked unit tests for the new pure code (lint, image prep, capability parsing,
  repair messages) run in `test:core` like the current `ollama.test.ts`.
- Per studio, 5 to 10 golden tasks, each with a scripted tool host and a checkable outcome. Examples:
  Photos "make it warmer" should produce a `raster_adjust` with a valid temperature-like value inside the bounds. Code "rename this class" should yield a file proposal where only the intended lines differ. Sheets "sum column B" should yield a formula that evaluates to the expected number.
- Metrics per model: valid-call rate, correct-tool rate, hallucinated-tool rate (name not offered), schema-valid argument rate,
  loop rate (more than 3 calls to the same tool), task success, and median seconds per turn.
- Output: a JSON report with the model digest, daemon version, hardware note and date. Reports are
  data for decisions. They are not bundled as a "supported models" claim.
- Starting thresholds (hypotheses to adjust after the first runs): schema-valid args at least 90%, hallucinated tool at most 2%, loop at most 5%.

### 5.3 Runtime guardrails (independent of the model)

- Local models get `read` and `propose` only. `execute` stays unavailable, as for every model today.
- Every change is a reviewable proposal. Nothing is saved until the user saves.
- Vision-derived claims in the UI carry the existing AI label (`createAIProvenance`) and the line "Local model, quality not guaranteed".
- Per-turn limits as today (steps, calls, bytes). Local defaults may be lower, for example 8 steps, to stop long loops early. Unverified whether 8 is enough for real tasks. Tune with the eval set.

## 6. Honest limits of small local models

Expectations to state in the UI and docs. None of these were measured for this proposal.

1. Tool calling in small models (single-digit billions of parameters) is commonly less reliable than in large hosted models:
   wrong or invented argument values, ignoring tool results, repeated calls. The gate and the repair loop reduce this. They do not remove it.
2. Vision in small local models is useful for "what is in this picture" and rough text. Do not rely on them for exact
   OCR of dense text, precise colour values, pixel measurements, or judging aesthetic quality. Photo adjustments from a vision model are suggestions, always shown as before/after.
3. Quantization lowers quality further and the effect varies by model. The badge shows the quantization from `/api/show`.
4. Context: Ollama's default context can be small and may truncate silently. Local requests should set `numCtx` explicitly,
   and the UI should show the value in use. Large projects will not fit. The agent must say when context was cut instead of continuing as if it saw everything.
5. Hardware decides speed. First request after idle includes model load time. `keep_alive` defaults to 5 minutes (Ollama API doc). Expose it as a setting later.
6. Results differ across daemon versions. Eval reports record the version. A daemon update marks cached probes as stale.

## 7. UI sketch (Settings > AI > Local)

- Model row: name, size, chips `Vision`, `Tools` (state styling from section 2), tooltip with evidence and date.
- "Test model" button runs the probes with a progress list and shows which fixture failed.
- Role pickers: Chat and tools model, Vision model (used by `describe_image` and by "Attach canvas" when the chat model has no vision).
- Warning row when the selected chat model has `tools: failed` or `unknown`.
- All strings in the five locales. No fake or disabled-looking buttons without an explanation (existing rule).

## 8. Build plan (concept only, order matters)

1. Count tools per studio and per tier with the lint (pure, small, gives the first real numbers).
2. `inspectModel` merging `/api/show` locality and capabilities, with tests using mocked fetch fixtures from real Ollama responses. Fixtures must be captured from a real daemon, not invented.
3. Tool probe and "Test model" UI.
4. Repair messages for invalid arguments and the explicit invalid-JSON error. Update `session.test.ts` with new tests. Existing assertions stay unchanged.
5. `AgentImagePart`, image prep, Ollama mapping, then the vision probe.
6. `describe_image` two-model path, then `raster_look` after the tool-role image question is settled on a real daemon.
7. Eval harness and first reports on 2 or 3 models. Decide thresholds from data.

## 9. Interfaces this slice assumes from the other local-model slices

- A model list with digest, size and quantization (model-list slice). Probe caching depends on the digest.
- A place to store per-model settings such as `numCtx` and `keep_alive`.
- Voice and audio models: not covered here. Sound studio audio understanding is theirs.
- Install and pull flows. This slice only reads what is installed.

## 10. Unverified and open

- Minimum Ollama version for `capabilities` in `/api/show`, and the exact capability strings across versions.
- Whether `tool` role messages can carry `images`, and `format` combined with `tools`.
- Best image size, token cost per image, and behaviour with 2 to 4 images, per model.
- Where the lint thresholds really sit. Real tool counts per studio.
- Behaviour of two models loaded together on typical consumer hardware.
- Open decisions for Philipp: (a) accept the two-model pipeline as the default vision route, (b) keep Vibe Space off local models by default, (c) lower default step limit for local models, (d) whether the first eval models should be chosen by him or by the eval results.
