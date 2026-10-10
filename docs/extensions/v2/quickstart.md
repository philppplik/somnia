# Quickstart

Build a `.somniax` extension, validate it with the same gates the installer runs,
and pack it. About 8 minutes. No account, no store, no registration.

Applies to: API v2+ · Verified on Windows, Linux, macOS by CI (the dev-docs
workflow runs these commands verbatim).

## 1. Check prerequisites

You need Node.js LTS and a checkout of the
[`philppplik/somnia`](https://github.com/philppplik/somnia) repository with its
dependencies installed (`cd phase1 && npm ci`). That is all — the authoring kit
ships with the repo and uses the exact validator and package gate the installer
runs, so a pass here means the package installs.

> A standalone `npm create somnia-extension` scaffolder is planned; until it
> ships, the quickstart creates the two files by hand (step 2) — they are short.

## 2. Create the project

Make a folder `hello/` with two files.

`hello/somnia-extension.toml`:

```toml
manifestVersion = 2
id = "acme.hello"
publisher = "acme"
name = "Hello"
version = "0.1.0"
description = "Says hello from the command palette."
license = "MIT"
activationEvents = [ "onCommand:acme.hello.say-hello" ]
permissions = [ "commands", "ui.notify" ]
dependencies = []

[engines]
somnia = ">=11.0.0 <12.0.0"
api = ">=2.0.0 <3.0.0"

[runtime]
type = "js"
entry = "extension.js"

[capabilities.untrustedWorkspaces]
supported = "supported"

[capabilities.virtualWorkspaces]
supported = true

[[contributes.commands]]
id = "acme.hello.say-hello"
title = "Say hello"
category = "Tools"
```

`hello/extension.js`:

```js
// The js lane loads this bundle as an ES module and calls activate(somnia).
export function activate(somnia) {
  somnia.commands.register("acme.hello.say-hello", async () => {
    await somnia.ui.notify("Hello from my first extension.");
    return null;
  });
}

export function deactivate() {}
```

## 3. Validate

Run the authoring kit from the `phase1` directory of your checkout:

```
$ npx tsx scripts/somnia-ext-v2.ts validate ../../hello
✓ manifest valid (0 errors, 0 warnings)
✓ package ok: 2 files, 1.2 KiB expanded
```

The first line is always the manifest result. Validation runs on every save once
this is in your editor loop — treat it as the compiler for your package. Errors
print a stable code, a JSON pointer and a fix, for example:

```
error SOM-EXT-002 /contributes/commands/0/title must NOT have more than 80 characters
```

Look the code up in [Error codes](./error-codes.md).

## 4. Change the title, re-validate

In `somnia-extension.toml`, change `contributes.commands[0].title` to
`"Say hello, loudly"` and save. Re-run the validate command. It passes again —
you have just edited the contribution the command palette shows, with no restart
and no build system.

## 5. Pack it

```
$ npx tsx scripts/somnia-ext-v2.ts pack ../../hello
✓ manifest valid (0 errors, 0 warnings)
✓ package ok: 2 files, 1.2 KiB expanded
✓ wrote /path/to/acme.hello-0.1.0.somniax
  sha256: 9f2c…
```

The `.somniax` is a ZIP with your manifest at its root; the SHA-256 is the
integrity hash an index entry pins. Packing runs the full package gate: path
safety, budgets, referenced-file inventory, archive rules.

> **Loading in Somnia.** Executable v2 packages activate on targets that
> advertise the matching runtime; the browser host currently advertises **Wasm
> only**, so a `js` entry reports `E_INCOMPATIBLE_API` there today. Declarative
> contributions (themes, snippets, native panels) register without code. The
> staged rollout is documented in [runtime.md](./runtime.md).

## 6. Tour the files

| File | What it is | Reference |
| ---- | ---------- | --------- |
| `somnia-extension.toml` | The manifest: what you contribute, which permissions you ask for | [Manifest reference](./manifest-reference.md) |
| `extension.js` | Your code. `activate()` registers the command | [Developer guide](./developer-guide.md#2-anatomy-of-an-extension) |
| `acme.hello-0.1.0.somniax` | The packed, hashable artifact | [Packaging](./developer-guide.md#7-packaging-and-the-integrity-hash) |

## Next steps

- [Build a panel extension](./examples/hello-panel/) — add a side-rail panel and activation for it
- [Ask for consent](./examples/fs-consent/) — read a file outside the project with `[security.fs]`
- [Declare a network host](./examples/network-host-scope/) — call one HTTPS host with a stated reason

## Stuck?

- Work through the checklist in [Error codes → activation and install](./error-codes.md#som-ext-003-semantic-contract).
- The same validator backs `validate`, `pack` and the install gate — a local pass is never partially registered.
