# 7. Security model

Somnia assumes an extension may be buggy or hostile. The design limits what a bad extension can do. It is not a promise that every extension is safe to run, so only enable extensions you trust.

## Boundaries

| Surface | Isolation | Strength |
| ------- | --------- | -------- |
| Worker code | Dedicated Web Worker from a Blob, no DOM, network and storage globals (`fetch`, `XMLHttpRequest`, `WebSocket`, `indexedDB`, `importScripts`, nested workers and similar) removed before your code runs | Best effort. A strict worker CSP is tracked in [ADR-003](../../phase1/notes/ADR-003-extension-sdk.md) |
| Panel HTML | Own document at `somnia-ext://panel/...` in a sandboxed iframe (`allow-scripts` only, opaque origin, never `allow-same-origin`) with a restrictive resource-fetch CSP. The CSP is not a total no-network guarantee and does not stop the frame from navigating itself, so authority does not rest on it: calls travel over a one-time MessagePort bound to the first document by a session token, the port is closed on any further load, and panel documents are single-use on the native side. A navigation request can still leave one request before the guard fires, and native navigation denial plus IPC exclusion per engine are not yet verified (see [security review](../../phase1/notes/EXTENSION-NATIVE-CSP-SECURITY-REVIEW.md)) | Browser-enforced restrictions; navigation and session rules enforced in Somnia; native verification pending |
| Host API | Every call is validated: permission, argument types, size limits, file names | Enforced in Somnia |
| Project changes | Whitelisted editor operations in one undoable transaction; no `replaceSource`; no direct disk write | Enforced in Somnia |

## Current limits and caveats (apiVersion 1)

- The host API does not grant raw disk access, clipboard reads or app DOM access. Worker global removal is best effort, not proof of no network or cross-extension storage access. Panels have opaque origins, but their CSP does not alone forbid self-navigation.
- Fresh installs are disabled by default. Local replacement of an enabled id can inherit enablement and newly declared permissions; review replacements before running them. Disablement disposes the normal worker runtime.
- Host-mediated editor operations leave an undo step. This does not make inserted HTML or exported project code safe.
- The host API rejects undeclared or revoked permissions. This covers mediated API calls, not all declarative contribution actions.

## What it can do within its permissions

- With `project.read` it reads all open files, including unsaved text. Do not enable unknown extensions on private projects.
- With `project.write` it can change or delete elements in the open project, including inserting active HTML that persists in saved/exported source. Use undo (Ctrl+Z) to revert. Declarative HTML snippets also insert source when invoked, outside the host API permission check.
- With `storage` it keeps up to 20000 characters per value.

## Installation hygiene

- Manifests are plain JSON, so you can read the full `code` before installing.
- Prefer extensions from repositories you trust. There is no signature check or marketplace review in round 1.
- Manifest validation rejects unknown permissions, oversized values and non-color theme values.

## Native transport repair (proposed)

A separate `somnia-ext://` transport with host-owned response CSPs is being reviewed to repair native worker/panel execution without enabling JavaScript eval or inline scripts in the production app policy. It is not a verified security boundary yet. See the [source-grounded review and release gates](../../phase1/notes/EXTENSION-NATIVE-CSP-SECURITY-REVIEW.md). Keep catalog worker packages blocked until a separate admission review passes.

## Reporting a problem

Open an issue at https://github.com/philppplik/somnia/issues. Do not include secrets or private project content.

Next: [Tutorial](08-tutorial.md). The planned apiVersion 2 model is in [Security model v2](14-security-model-v2.md).
