# Somnia Extensions — SDK v2 developer documentation

> API version: **v2 · next** (main) · Minimum Somnia version: **11.0.0** ·
> Repo path: `docs/extensions/v2/`
> Reading the v1 docs? They live one level up in [`docs/extensions/`](../README.md).

Build an extension, validate it with the same gates the installer runs, and pack a
`.somniax` — **no account, no store, no publisher registration**.

**[Start the Quickstart](./quickstart.md)** · **[Browse the examples](./examples/README.md)**

```
cd phase1 && npx tsx scripts/somnia-ext-v2.ts validate <your-extension-folder>
```

## Where do you want to start?

| I want to… | Go to |
| ---------- | ----- |
| …try something | [Quickstart](./quickstart.md) · [hello-panel example](./examples/hello-panel/) · [Error codes](./error-codes.md) when something fails |
| …build a specific thing | [Developer guide](./developer-guide.md) · [Manifest reference](./manifest-reference.md) · [Examples catalogue](./examples/README.md) |
| …publish | [Packaging](./developer-guide.md#7-packaging-and-the-integrity-hash) · [Security checklist](./developer-guide.md#10-security-checklist-for-authors) · [Error codes](./error-codes.md) |

## Four kinds of pages

These docs follow Diataxis. A page belongs to exactly one kind and never mixes kinds.

- **Tutorials** teach by doing — [Quickstart](./quickstart.md). *(1 page)*
- **Guides** solve one task each — the [Developer guide](./developer-guide.md) chapters. *(1 page, 10 chapters)*
- **Reference** states facts — [Manifest reference](./manifest-reference.md) (generated),
  [Error codes](./error-codes.md), plus the branch contract pages
  [manifest-and-package](./manifest-and-package.md), [permissions-security](./permissions-security.md)
  and [runtime](./runtime.md). *(6 pages)*
- **Concepts** explain why — [Developer guide ch. 3–4](./developer-guide.md#3-anatomy-of-an-extension)
  and the contract pages above.

## What extensions can and cannot do

**Can:** contribute commands (palette, menus, `when` context), side-rail panels
(declarative view trees or isolated webviews), code and UI themes, snippet sets;
read project files (`project.read`), edit through one undoable transaction
(`project.write`), read the selection, store namespaced state, show notifications,
and — with explicit user consent — read files under an `ask` scope and call
**declared** HTTPS hosts.

**Cannot:** run native code (tier B is manual-install only), make undeclared or
redirected network calls, set ambient cookies or auth headers, read files outside
the granted scope, read other extensions' storage or secrets, execute JavaScript
on targets that only advertise the Wasm runtime, patch the app, run after the host
closes, or touch the Somnia Agent's keys, prompts or billing.

Snippet and theme extensions need no code and no permissions at all.

## Examples

| Example | Teaches |
| ------- | ------- |
| [hello-panel](./examples/hello-panel/) | Command + declarative panel, activation events, the dev loop |
| [fs-consent](./examples/fs-consent/) | `[security.fs]` with `ask` consent, denial handling, limited untrusted mode |
| [network-host-scope](./examples/network-host-scope/) | `[[security.network]]` exact-host scope, secret-free fetching, offline handling |

Every example is a real folder that CI validates, assembles and unit-tests on each
change — code blocks in these docs come from tested files, never hand-pasted.

## Feedback

Found a problem? Open an issue titled `Docs feedback: <page>` in
[philppplik/somnia](https://github.com/philppplik/somnia/issues).
