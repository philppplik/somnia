# Somnia Agent: product and UX concept

Status: design draft, 6 October 2026. This is a product specification, not an implementation report or release announcement.

Somnia Agent is a native right-hand panel. The user describes a change, the agent reads a bounded project context and proposes changes to real files. Somnia's code diff is the review surface. Changes enter the editor only after acceptance and reach disk only through Save.

This English edition translates the supplied German concept and incorporates the owner's later direction: keep OpenRouter, Ollama and researched ChatGPT/Claude subscription-auth options in the design; plan MCP and ACP separately; require opt-in for third-party processing and clear AI/error notices. Earlier recommendations remain recommendations where no final choice or implementation evidence exists.

## Basis and limits

The source concept describes a local-first visual web editor built with Tauri and React. This documentation branch starts from `phase1-foundation` at `56e2732148d367209b81b65840aeeadebc43027c`, which reports `somniaRelease: 10.3.0`. The separate `main` branch is older. Agent components are being developed on topic branches; this document does not certify their integration or release readiness.

The supplied panel mockup is a design reference, not a working integration. The updated direction has a plain header, a gradient only at the bottom and a bottom-right `vadivam:sparkles` control in the collapsed rail. Icon licensing still needs release verification.

Provider facts and design requirements are distinct. Model availability, prices, account privacy settings, native credential storage and editor transactions require implementation-specific tests. [Architecture](ARCHITECTURE.md), [providers](PROVIDERS.md) and the [privacy draft](PRIVACY.md) define those boundaries.

## Product promise

"Describe what you want to build. Somnia Agent proposes changes. You review the diff and choose what to accept."

Do not promise error-free code, perfect websites, a complete security audit or purely local AI when a cloud provider is selected. Local-first describes project storage and user control, not every inference request. Label the feature as AI and state that AI can make mistakes.

Shortest successful flow:

```text
Open project -> review context -> send request -> read and propose
-> review diff -> accept -> check preview -> save
```

## 1. Scope and delivery stages

### First complete editing workflow

- Chat: streaming, multiline input, new chat and local project-specific history. Respect the UI language without rewriting code. Do not claim permanent model memory.
- File work: read and search permitted text files; propose file creation and edits. Support HTML, CSS, JS/TS, JSON, Markdown and text SVG. Explain unsupported files and size limits. No file deletion or renaming in this workflow.
- Review: use the code editor diff, with accept/reject per hunk, file and coherent change set. Review new files as whole files.
- Context: explicit attachments, code selection and canvas selection with file identity; optional approved project search; inspectable transmitted content.
- Agent loop: bounded, multi-step reading, searching, proposal generation and interpretation of existing diagnostics. Produce a change set rather than only copy-and-paste text.
- Settings: provider credentials, tested model selection, privacy policy, step/output limits, usage and cost information, local-history deletion.

OpenRouter is the first cloud adapter. Ollama is an additional local-model path, not excluded from the architecture. ChatGPT subscription sign-in has an official eligible open-source route still requiring integration checks. Anthropic currently prohibits third-party Free/Pro/Max login; Claude remains available through legitimate API/provider paths, not subscription-token reuse. See [PROVIDERS.md](PROVIDERS.md) for the readiness distinction.

### Separate capabilities

Plan MCP tool/resource connections and ACP agent sessions without confusing them with model inference. Terminal/test/build execution, package installation, image or binary generation, Git, deployment, background work and shared team agents need their own permission and recovery design. No arbitrary external server, shell command or deployment is enabled merely because the model asks for it.

Do not ship empty controls for Somnia credits, cloud accounts, a marketplace, web search or unrestricted autonomy. A roadmap can describe future work; the working interface exposes usable capabilities only.

OpenRouter connects model providers. MCP connects tools and resources. ACP connects an editor to an agent runtime. Somnia still owns permissions, cancellation and editor review.

## 2. The right-hand panel

### Layout

- Collapsible right panel with a draggable divider. At narrow widths, use a focused side surface instead of squeezing canvas and code into unusable columns.
- Header: Somnia Agent, new chat, history and close. Put model and context in a compact secondary row.
- Body: conversation and chronological action cards. Collapse raw tool output by default; avoid a debug-text wall.
- Footer: input, add context and send. Replace Send with Stop during work. Enter sends; Shift+Enter inserts a newline; offer an alternative Enter preference.
- Keep the Somnia gradient at the bottom, not behind conversation text. The header stays plain. Blur must preserve contrast and visible focus. Place the collapsed rail's opening control at the bottom-right above the gradient with a readable background.

### States

```text
Ready -> preparing context -> requesting -> running tools -> reviewing changes
-> accepted / rejected
```

Errors and cancellation are separate states. An action card can say "Read: index.html and styles.css", then "Proposed: hero and responsive layout", then "2 files, 6 changes, Open diff".

Accepted is not saved or tested. Somnia's existing save indicator remains the single global save-status source. A one-off chat message can say: "Accepted into the editor. Not yet saved to disk."

### Empty states and accessibility

Without a project, offer Open; general chat must say it has no project context. Without credentials, open Settings rather than requesting secrets in chat. Example prompts insert text and never send automatically.

Give icons tooltips and accessible names. Keep focus visible. Streaming must not steal focus; auto-scroll only when the user is at the conversation end. Batch screen-reader status updates rather than announcing every token. Escape closes subordinate views without silently stopping work.

## 3. Main UX flows

### Build a landing page

1. Open a project and submit the request. Ask briefly for missing purpose, audience or content. Do not invent customer quotes or company facts.
2. Review context, such as `index.html`, `styles.css`, selections and conversation history. Name the actual processing route. Broader read access requires its own approval and explanation of possible cloud transmission.
3. Read permitted files and show action cards and filenames. Summarize the intended work without presenting hidden model reasoning.
4. Create changes in an isolated proposal. Leave original buffers and disk untouched. Never silently overwrite an existing `index.html`.
5. Open the existing code-editor review surface, not a second diff popup. Keep the panel available for conversation.
6. Accept selected changes, check the preview and local diagnostics, then save normally.

A new project needs an agreed target structure first. Do not automatically install frameworks, packages, fonts, trackers or external resources. Mark external resources explicitly.

### Make this button larger on mobile

1. Offer the canvas selection and its file as context chips. Selection alone does not grant full-project access.
2. Read approved styles. If another file is needed, ask: "May I include styles.css?"
3. Show the change and affected breakpoints in the diff. The user accepts or rejects.
4. Check a narrow viewport. Claim mobile correctness only for a state that was actually checked.

### Follow-up edits and commands

"The spacing is too large" refers to the previous change set. Replace pending proposals where appropriate, but never silently undo accepted work. Every new proposal uses the current editor state.

Natural-language requests are sufficient. Actions such as Explain selection or Suggest a change insert understandable text and the actual selection. Assign shortcuts only after checking existing Somnia bindings.

## 4. Diff, acceptance and saving

### Three states

| State | Meaning |
| --- | --- |
| Proposed | Isolated; neither editor nor disk changed |
| Accepted | In the editor; reversible through the editor's undo integration |
| Saved | Written to disk through Somnia's normal save path |

Persist proposals locally and revalidate their base after restart. History must not label an uncertain write as success.

### Hunk review

Show file, added/removed lines and purpose. Acceptance is unavailable while a change set is incomplete or streaming. Apply only selected hunks; rejection never deletes original content. Before Accept all, show files and scope. New files are accepted or rejected as complete files.

Mark known dependencies, for example an HTML class and its CSS rule. If partial acceptance cannot be applied safely, offer a connected group or regenerate the proposal. Do not claim complete detection of semantic dependencies. After partial acceptance, inspect the resulting state and warn about possibly incomplete behavior.

### Stale patches and conflicts

Bind proposals to editor revisions, including unsaved changes. If the base is stale, block instead of overwriting. The initial recovery is "Propose again from the current state". No silent fuzzy matching.

External disk changes stay in Somnia's existing conflict workflow. Explain permissions and locked-file failures before acceptance. A coherent acceptance should be one undo step; Save is separate. Undo after saving or external changes is not a guaranteed safe rollback.

On project switch, stop running work and ask whether pending proposals should be kept or discarded. Do not carry chats or context into a different project. Preserve unsaved-change warnings.

## 5. Project context and privacy

Default to the request, deliberate selections and attached files. No hidden full-project upload. Filenames, trees and absolute paths can also be confidential.

Distinguish attached, permitted to read and actually transmitted context. Optional project-reading permission is chat-scoped and explains cloud transmission. Make outgoing data inspectable, including tool results and conversation summaries. Within an approved scope, visible action cards suffice; outside it, obtain new approval. Revocation blocks future access but cannot retrieve previously sent content.

Block `.env` variants, private keys, credentials, `.git`, dependency directories and build output by default. Do not transmit binary files in the initial text workflow. Custom exclusions add protection. Local secret scanning warns but cannot find every secret in source or chat.

Show size limits, omissions and truncation. Keep operations within the approved project or explicitly opened single file. Block traversal and symlink escapes. A model statement cannot widen permissions.

Project comments and MCP output are data, not permission. Embedded instructions cannot add access, commands or destinations. Enforce tool permissions outside the model.

Candidate onboarding text, usable only after the implementation verifies it:

> Project files and credentials are stored locally. For cloud AI requests, Somnia sends approved content to the selected provider and any disclosed downstream processors. Review context before sending. Those providers have their own privacy rules. AI can make mistakes; review generated changes before accepting them.

Do not assert GDPR compliance, EU hosting, no intermediaries or complete confidentiality without evidence. [PRIVACY.md](PRIVACY.md) is the draft source for implementation notices.

## 6. Credentials, models, cost and external connections

Use a maintained model catalog with separately tested agent compatibility. Distinguish display name, model ID and capability. Enable file actions only for tested combinations. Claude and DeepSeek are preferences, not a guaranteed model list. Codex means a concrete product/runtime option, not any arbitrary OpenAI model.

Store credentials in a verified native credential store or reviewed encrypted store, never in projects, exports, chat, preview documents or logs. Allow masking, replacement and deletion. New model/privacy settings take effect at a clear request boundary; never silently change an active request.

Recommend ZDR-compatible OpenRouter endpoints by default. If no eligible endpoint exists, stop and explain. A relaxation requires deliberate choice; no hidden fallback. "No training" and "no retention" are different claims. Local history is optional and deletable; local deletion does not delete provider-held data.

Before a run, show dated prices and a defensible estimate where possible. Otherwise label the advance cost unknown. Afterwards show reported usage/cost, model and provider when available. Missing cost is unknown, not zero.

Bound output tokens, steps, retries and runtime. Local budgets stop further requests but do not guarantee a cent-exact total because requests may be in flight and usage may arrive late. Promise a hard maximum only if it is enforced end to end.

Every MCP connection needs operator/address, local/remote status, capabilities, data scope and revocable permissions. Local processes can execute code; local does not mean safe. Never activate servers automatically. Approve new destinations and external write actions separately. ACP agents require the same honest distinction between editor proposals and effects performed by the external runtime.

## 7. Errors, stopping and evidence

Stop ends the local loop and attempts transport cancellation. Do not begin more tool actions after Stop. Label partial responses cancelled; incomplete change sets are not acceptable. Retain complete proposals if useful and leave originals unchanged.

Stop is neither a refund nor proof that remote processing ended immediately. Costs may already have been incurred.

| Failure | Required behavior |
| --- | --- |
| Invalid key or insufficient credit | Explain the known cause and open Settings; no hidden paid retry |
| Rate limit or timeout | Preserve state, show attempt, require a controlled retry; no infinite loop |
| Unsupported tools | Offer compatible model or chat-only; do not portray text as an executed file action |
| Excess context | Identify missing areas and let the user reduce context; no silent clipping |
| Invalid patch | Do not apply; bounded regeneration with visible extra usage |
| Conflict | Inspect current state, regenerate or discard; no guessed overwrite |
| Offline | Local history/diffs remain available; cloud work is unavailable |
| Crash | Reopen complete proposals and recheck bases; reconcile uncertain writes before retrying |

Tie claims to evidence. Proposed means a diff exists. Syntax checked requires a real check on the named revision. Tests passed applies to that test run, not untested partial acceptance. Visually checked requires a real preview check. The initial workflow does not claim automatic browser testing.

Action cards show target, status and understandable outcome, with expandable request IDs and usage. Do not display hidden model reasoning or invent a thought narrative.

## 8. Decisions and recommendations

- Keep the complete chat/file/diff workflow, deliberate acceptance and separate Save. Any automatic write mode requires its own permission design.
- Start with selections and attachments; optional reading permission is chat-scoped. Prefer ZDR with no silent relaxation and accept reduced endpoint availability.
- Test a small model set while retaining provider extensibility. Research subscription-auth options rather than treating a consumer subscription as an API credential.
- Store history privately per project, outside the repository by default; optional, deletable, without cloud sync. Set retention before shipping.
- Keep chat and credentials personal. Accepted changes may enter ordinary collaboration; remote processing of shared content needs appropriate permission. A shared team agent is separate.
- Use Somnia Agent in the UI; Oneiroi may remain an internal layer. BYOK/direct provider billing is the design recommendation, not a settled commercial pricing policy.

MCP and ACP are planned paths endorsed for investigation, not unrestricted rights. ChatGPT registration/plan details, legitimate Claude access, icon licensing and legal review remain gates.

## 9. Acceptance, not placeholders

A complete editing workflow must demonstrate:

- A real request produces visible actions and an applicable multi-file diff, not just copyable text.
- Editor and disk remain unchanged before acceptance; new and existing files can be reviewed separately.
- Hunk review, partial acceptance, dependencies, undo and save have distinct, working states.
- Unsaved user changes survive; stale proposals are blocked; project switching mixes nothing.
- Tests block prohibited files, traversal and symlink escapes; file instructions cannot widen permissions.
- Context and transmitted content are visible; opt-in and revocation are enforced before remote processing.
- Credentials never enter project/export/log paths; history can be disabled and deleted.
- Stop, auth/credit failure, unknown cost, timeout and unavailable endpoint states are understandable.
- Fallbacks do not silently relax privacy, cost or capability limits.
- Keyboard, focus, contrast, screen-reader status and long filenames are checked.
- Native credential storage, permissions, save conflicts and restart recovery are tested on Windows and other supported platforms.

Suggested sequence: panel/settings/explicit-context chat; bounded read/search tools and isolated changes; hunk review/new files/conflicts/undo/save integration; cancellation/recovery/security/native tests. Only the whole chain fulfills the editing workflow. Intermediate work remains development work.

## 10. Sources and remaining uncertainty

Primary sources supporting provider semantics, not completed Somnia functionality:

- [OpenRouter ZDR](https://openrouter.ai/docs/guides/features/zdr): inference routing; not a blanket promise about tools or every form of processing.
- [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection): explicit endpoint and fallback control.
- [Provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging): retention and training are separate.
- [OpenRouter data collection](https://openrouter.ai/docs/guides/privacy/data-collection): distinguish content handling from request metadata and account options.
- [Generation metadata](https://openrouter.ai/docs/api/api-reference/generations/get-request-&-usage-metadata-for-a-generation): usage/cost reconciliation needs real integration tests.
- [MCP security practices](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices): external connections require independent security and permission boundaries.

Outstanding: actual model IDs/prices/account settings, subscription-auth eligibility, agent quality, stable editor transaction interfaces, native storage, third-party notices and legal assessment. Verify these in implementation and acceptance rather than turning them into product promises.
