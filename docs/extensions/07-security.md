# 7. Security model

Somnia assumes an extension may be buggy or hostile. The design limits what a bad extension can do. It is not a promise that every extension is safe to run, so only enable extensions you trust.

## Boundaries

| Surface | Isolation | Strength |
| ------- | --------- | -------- |
| Worker code | Dedicated Web Worker from a Blob, no DOM, network and storage globals (`fetch`, `XMLHttpRequest`, `WebSocket`, `indexedDB`, `importScripts`, nested workers and similar) removed before your code runs | Best effort. A strict worker CSP is tracked in [ADR-003](../../phase1/notes/ADR-003-extension-sdk.md) |
| Panel HTML | Own document at `somnia-ext://panel/...` in a sandboxed iframe (`allow-scripts` only, opaque origin, never `allow-same-origin`) with a CSP that blocks subresource requests, forms and `<base>`. The frame can still try to navigate itself, so authority does not rest on the CSP: calls travel over a one-time MessagePort bound to the first document by a session token, the port is closed on any further load, and the app's `frame-src` refuses external frame URLs | CSP browser-enforced; navigation and session rules enforced in Somnia |
| Host API | Every call is validated: permission, argument types, size limits, file names | Enforced in Somnia |
| Project changes | Whitelisted editor operations in one undoable transaction; no `replaceSource`; no direct disk write | Enforced in Somnia |

## What an extension cannot do (apiVersion 1)

- Make network requests, read or write local files, read the clipboard, touch the app DOM or other extensions' storage.
- Run before the user enables it, or keep running after it is disabled.
- Change files without leaving an undo step.
- Use a permission it did not declare, or one the user revoked.

## What it can do within its permissions

- With `project.read` it reads all open files, including unsaved text. Do not enable unknown extensions on private projects.
- With `project.write` it can change or delete elements in the open project. Use undo (Ctrl+Z) to revert.
- With `storage` it keeps up to 20000 characters per value.

## Installation hygiene

- Manifests are plain JSON, so you can read the full `code` before installing.
- Prefer extensions from repositories you trust. There is no signature check or marketplace review in round 1.
- Manifest validation rejects unknown permissions, oversized values and non-color theme values.

## Reporting a problem

Open an issue at https://github.com/philppplik/somnia/issues. Do not include secrets or private project content.

Next: [Tutorial](08-tutorial.md).
