# Agent-native Somnia: app-wide engine tools

Status: **In development - concept**. This proposes a new app-operation layer; it is not implemented acceptance, a blanket runtime permission or a release claim. Search-only controls retain their existing separate boundaries.

## Product intent

The side panel accepts an instruction such as "Make the selected photo warmer" or "Create a three-slide outline from this selected text". A local model plans small typed actions, inspects the right studio state, previews risky changes and applies approved changes through the same engine commands and history as the UI. The user sees the target, provider/model, progress, proposals and what actually changed. No separate browser automation, DOM clicks or second editor model.

Ollama is first. Providers remain pluggable through the existing streaming provider interface, with no new cloud dependency. Local runtime metadata is not proof of physical execution; exact model capability/privacy checks remain. A failed local run does not silently disclose its context to another provider.

## Grounded starting point

This checkout has384 inventoried UI commands in `docs/ui-commands.md`, not verified456. Mount-time and separate host dispatchers mean a static count is not a complete runnable tool set. Regenerate the inventory on the integration tip before setting coverage targets.

Existing foundations are useful but must not be presented as the requested complete app operator:

- `CommandSpec` has stable ID, JSON-schema parameters/result, enabled check and read/propose/ui level. Legacy adapters use ui and unvalidated payloads.
- `CommandDispatcher` validates arguments/results, refuses ui from agent/MCP origin and records outcome/timing without parameter/result contents. It is not an app-wide transaction manager.
- `commandTools.ts` already generates read/propose tools and follows live registry additions/removals. It skips invalid/colliding names and never exposes ui as execute. Sound can have a separate host-bound dispatcher.
- `AgentToolRegistry` defaults to read/propose; execute registration needs explicit host support. Its current schema grant hash is a small stable hash, not a security identity for the new wider action contract.
- `AgentSession`, provider streaming, side-panel proposal/approval events, studio context adapter and reviewed native document transactions exist. Current studio declarations intersect real tools; a declaration is not proof of engine readiness.
- `TransactionManager` rechecks proposal/base/policy around awaits and protects history origin on undo. Reuse those rules, but prove equivalent native history ports for each studio.

The first build wave audits these facts on the real tip instead of replacing working layers or granting all UI commands to the model.

## One canonical typed action contract

Generate provider tool definitions from live command specs plus explicit engine action metadata. Do not infer effect, target or safety from title, keyword or ID prefix. Add a reviewed contract adjacent to the native spec, not a hand-written parallel tool list:

| Field | Proposed meaning |
| --- | --- |
| id/version | Stable command ID and action-contract version |
| params/result | Fail-closed supported JSON Schema with bounded arrays/strings; unknown fields refused |
| target | Required project/document/studio/entity references, not implicit active selection |
| effects | Explicit read, reversible edit, destructive edit, filesystem, network, publish or spend |
| context | Required state/selection inputs and disclosure class; bounded snapshot policy |
| transaction | Native prepare/preview/validate/commit/undo port and operation grouping |
| preconditions | Project generation, document revision, selected entity IDs and capability requirements |
| cancellation | Cancel-safe stages and honest outcome after the commit boundary |
| availability | Real engine readiness, enabled reason and host/role eligibility |
| review | Mandatory preview/confirmation or eligible scoped auto-apply policy |

The generator exports only specs whose contract and engine port meet the requested effect. Inventory distinguishes typed tools, read-only, preview-only, interactive-only, unsupported and unavailable. An empty parameter schema is not evidence that a command safely targets a document. Collisions/missing result schemas/unsupported validators are visible failures, not renamed or silently callable tools.

Keep `origin:'agent'` through dispatch. Never disguise a model call as ui/test/control or add agent to the interactive-origin allowlist to bypass guards. Wider reversible execution needs a dedicated policy-gated native action path and explicit capability, not lowering the current ui barrier. Existing read/propose bridge stays compatible.

Provider schemas derive from a canonical validated subset and stable name mapping. Recheck the live contract at call time; registry/hash/target drift invalidates pending approvals. A canonical cryptographic fingerprint of schema, effect, target/review policy and implementation contract version binds new grants. No grant migration silently upgrades earlier read/propose scope.

## Read and context tools

Offer bounded engine-native reads: project/studio inventory; document metadata and revision; current selection IDs/ranges; selected text or object properties; layer/slide/sheet/timeline hierarchy; diagnostics and history-head metadata. Distinguish absent state, unsupported engine and stale snapshot. Do not scan arbitrary project files by default.

Screenshots are a separate optional read capability. Capture the named studio/document viewport through an owned render surface, with revision/dimensions/crop metadata. No OS-wide screen, hidden tabs, credentials or unrelated windows. Image-capability verification and review of disclosure are required before image input; a text-only model gets metadata or an explicit unsupported result. Pixels support inspection, never authorize action.

The host pins project generation, document ID/revision, studio and selection at turn start. Each action validates its exact current target again. Changing focus does not silently retarget a queued action. Cross-studio actions use named document references and explicit capability discovery; reading a source and creating a destination is a two-target scope. Preview shows both. The model can request a missing read; only the host decides whether its scope is allowed.

Source text, comments, filenames, tool output and image text are untrusted data. They cannot grant permissions, choose a new disclosure destination or override the user. Context packages preserve provenance and bounds. Keep private payloads out of ordinary activity/error logs; diagnostics must not replay hidden source text.

## Permissions and reviews

A typed instruction authorizes a goal inside its selected project/documents, not every registry command or external effect. Product runtime permission is separate from development approval to build the feature.

Default mode is read + propose. An optional user-selected scoped mode can auto-apply reversible edits only after naming documents/action families/limits and a revocable session boundary. It must not cover destructive changes, export/overwrite, publish/deploy, network, payments, credential access or other audiences. Those effects require a separate explicit review. Stable release, Microsoft Store and server actions remain separately gated.

Preview/confirm for destructive operations shows exact target IDs, before/after effect, affected count, replacement/deletion and undo limitations. Accept binds to exact preview/revision/action contract; an edit or registry change requires a new preview. Cancel/revoke stops queued work, never counts as rejection approval and never pretends to undo committed effects. Collaboration follows host authority and document locks, not model confidence.

Development time-box wording is not an app permission implementation. Any later execution must recover the owner's actual instruction, intended expiry/timezone and exclusions; a reported approximate deadline cannot settle its own authority. The concept does not extend or interpret that grant.

## Undo-safe engine action

An agent action is a bounded engine transaction, not an arbitrary model turn. Prepare reads and validates; preview is side-effect free; commit revalidates revision/selection/policy after awaited work and applies atomically with one history origin. A no-op adds no undo entry; failure adds none; success adds exactly one native undo group for that action.

If an operation needs five commands, expose a native batch transaction with validation and rollback, or commit five clearly separate actions with five undo steps. Never merge unrelated manual edits or remote collaborative edits into an agent group. Cross-document undo cannot be promised until a real coordinated engine transaction exists; initially split into document actions with visible partial completion.

Undo is allowed only when that action's native history group is still the eligible head. Later edits must produce a refusal or native conflict review, not restore an old whole-document snapshot over them. Validate content/history equivalence and selection semantics with engine tests for every studio. Save/export are separate effects; in-memory undo does not undo an external write, publish or payment.

## Agent loop and streaming panel

1. Capture goal, scope, current target/context and exact provider/model provenance.
2. Discover a small relevant tool set from real available contracts; do not send hundreds of schemas every turn.
3. Stream visible text/status. Buffer fragmented tool calls until complete; validate schema, name, size and call identity before any execution.
4. Inspect through scoped reads. Resolve ambiguous targets by asking the user rather than guessing.
5. Prepare preview or eligible reversible action. Policy validates target/revision/capabilities/grant again.
6. Pause for required review. On acceptance commit one action, verify the engine result/revision/history, and return a bounded structured receipt to the model.
7. Continue within explicit iteration/tool/time/context limits. Stop on repeated failure, target drift, revoked permission or unavailable provider. Summarize changed/unchanged/blocked, with per-action Undo where actually available.

Extend existing events with typed tool lifecycle and action receipts: validating, awaiting review, committing, committed, cancelled-before-commit, outcome-unknown and failed. Existing text/proposal/approval/provenance events remain. Do not expose hidden reasoning. The panel shows pending target, effect, provider/model, progress, review, stop and undo state with keyboard focus and localized accessible status. "Done" requires engine evidence, not a model sentence.

Mutations serialize per owned document. Independent reads may parallelize inside bounded resource limits; writes never race. Model/tool iteration and payload ceilings prevent loops. Cancellation aborts owned requests and pending preparation; after commit, report applied and offer valid undo. A timed-out command with unverifiable state is unknown, not retried. Read current revision/action receipt before retrying to avoid duplicate effects.

## Build waves and studio ownership

| Wave | Shared or studio builder assignment | Gate |
| --- | --- | --- |
|0|Shared command/Agent owner audits actual registry, bridgeable schemas, effects, dispatcher origins, transaction ports and coverage. Publish typed/unsupported matrix.|No blanket ui exposure; generator/validator/drift tests.|
|1|Shared owner builds scoped read/context catalog, policy/action receipt, local Ollama streaming tool-call path and panel review/stop/undo UX.|Fake fragmented calls, no private-log leaks, provenance, cancellation and grant revocation.|
|2A|Documents builder: selection/range/style reads and native text/style proposals.|Tracked revision, exact range, one undo group, unchanged save state.|
|2B|Sheets builder: selection/cell/formula reads and bounded range edits.|Typed values/formulas, no silent external formula/network action, exact undo.|
|2C|Slides builder: deck/slide/object reads, layouts and bounded text/shape actions.|Native object IDs, render preview and exact deck undo, no generated engine artifacts claimed locally.|
|3A|Photos builder: selected layer/adjustment reads and reversible settings edits; explicit destructive raster review.|Pixel preview, non-destructive settings or proved history port.|
|3B|Animation builder: selected objects/keyframes/timeline reads and native bounded keyframe actions.|Time units, interpolation/selection, one history group, playback not a commit.|
|3C|Sound builder: host-bound dispatcher/session reads and bounded clip/track edits.|Sample/time units, no arbitrary disk writes, native history/preview.|
|3D|3D builder: scene/entity/material/transform reads and native scene edits.|IDs/coordinate units, engine readiness, one undo group; unsupported actions stay excluded.|
|4|Cross-studio coordinator composes approved read/create/edit workflows through named targets.|No hidden source disclosure, no pretend cross-document atomic undo.|
|5|Native/device owner validates packaged CSP/Ollama capabilities/performance and all studio ports; accessibility/locales owner checks panel reviews.|Actual evidence per target before production claims.|

These are assignments to propose to the main coordinator, not spawned workers or claims of ownership acceptance. Builders return exact specs/ports, deterministic engine tests, preview pixels, undo evidence, omissions and integration bases. Shared owner reviews contracts before adding a family to the live tool set.

## Acceptance and non-goals

Required evidence: schema generation determinism/parity; untyped-command refusal; exact target drift and permission revocation; streamed fragmented malformed tool-call refusal; repeated/late-call idempotency; no-op/failure/success undo counts; destructive review matching; collaborative authority; error/cancel unknown states; provider isolation/no silent fallback; bounded context/screenshot disclosures; engine result/visual verification; five-locales keyboard and real platform screen-reader checks; real packaged local provider evidence.

Not in the initial waves: OS automation, arbitrary shell execution, universal unattended app access, automatically authorized cloud, hidden file crawl, external publish/deploy/payment, saved broad grants, cross-document atomic history without engine support or market/release/server operation. Existing generated-text features do not establish this wider tool execution.

Sources: [command inventory](../ui-commands.md), [existing tool registry](TOOL-REGISTRY.md), [Agent architecture](ARCHITECTURE.md), [local AI acceptance](../ai/LOCAL-AI-ACCEPTANCE.md). Current code paths named above are repository evidence, not live-device acceptance.
