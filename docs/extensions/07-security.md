# 7. Security model

Somnia assumes an extension may be buggy or hostile. The design limits what a bad extension can do. It is not a promise that every extension is safe to run, so only enable extensions you trust.

## Boundaries

| Surface | Isolation | Strength |
| ------- | --------- | -------- |
| Worker code | Dedicated Web Worker from a Blob, no DOM, network and storage globals (`fetch`, `XMLHttpRequest`, `WebSocket`, `indexedDB`, `importScripts`, nested workers and similar) removed before your code runs | Best effort. A strict worker CSP is tracked in [ADR-003](../../phase1/notes/ADR-003-extension-sdk.md) |
| Panel HTML | Sandboxed iframe (`allow-scripts` only, opaque origin) with a CSP that blocks subresource requests (fetch, images, forms, base). A script can still navigate its own frame; Somnia removes the frame on any second load and the packaged app's CSP (`frame-src 'self' blob:`) refuses external frame navigation. Treat panels as not network-proof: a navigation request to the app origin or, in unpackaged web builds, to an external URL can still leave one request | Partly browser-enforced; navigation guard enforced in Somnia |
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
