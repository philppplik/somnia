# Developer guide: build on the Somnia SDK v2

Task chapters for extension authors, from first folder to published package.
Applies to: API v2+. Every command shown here runs against the same validators
the installer and the index CI run.

Chapters: [1. Prerequisites and the authoring kit](#1-prerequisites-and-the-authoring-kit) ·
[2. Anatomy of an extension](#2-anatomy-of-an-extension) · [3. Branding](#3-branding) ·
[4. Permissions and consent](#4-permissions-and-consent) · [5. The development loop](#5-the-development-loop) ·
[6. Testing](#6-testing) · [7. Packaging and the integrity hash](#7-packaging-and-the-integrity-hash) ·
[8. Publishing](#8-publishing) · [9. Updating and deprecating](#9-updating-and-deprecating) ·
[10. Security checklist for authors](#10-security-checklist-for-authors) ·
[11. Versioning and compatibility](#11-versioning-and-compatibility)

## 1. Prerequisites and the authoring kit

You need Node.js LTS and a `philppplik/somnia` checkout with `cd phase1 && npm ci`
done once. The authoring kit is a repo script that wraps the installer gates:

| Command | What it does |
| ------- | ------------ |
| `npx tsx scripts/somnia-ext-v2.ts validate <folder>` | Runs the manifest and package gates. Errors exit `1`. |
| `npx tsx scripts/somnia-ext-v2.ts pack <folder>` | Validates, then writes `<id>-<version>.somniax` plus its SHA-256. |

Options: `--lane local|store|experimental` (default `local`; `store` rejects eager
`*` activation and tier B), `--somnia-version X.Y.Z` and `--api-version X.Y.Z` to
check compatibility against a specific host.

Validation is documented and runnable separately from upload on purpose: the
review uses the same rules, so there are no surprises at index time.

## 2. Anatomy of an extension

A v2 package is a `.somniax` ZIP with exactly one root `somnia-extension.toml`.
Folders during development have the same shape:

```
acme.hello/
  somnia-extension.toml   # manifest: identity, engines, runtime, contributions
  extension.js            # bundled entry for runtime.type = "js" (or .wasm)
  panels/summary.json     # declarative panel view tree (if you contribute one)
```

The manifest is the contract: `contributes` is registered by the host **before
any code runs**, `activationEvents` decide when your entry starts, `permissions`
are what the install review shows. The full field contract is the generated
[manifest reference](./manifest-reference.md).

**Lifecycle.** The supervisor walks dormant → activating → active → faulted. Your
`activate(somnia)` runs after the host handshake; register all command handlers
there, before the guest sends `ready`. Activation and command calls have
five-second deadlines. There is no automatic restart on fault — after a fault the
host disables the extension and puts one entry in the Problems panel.

**Disposal.** Everything the API hands back is a `Disposable`. Dispose
subscriptions in `deactivate()`; ended sessions reject pending calls with
`E_CANCELLED`, and late replies can never revive a session.

## 3. Branding

- `icon`: a package-relative image shown on the card, detail page and install review.
- `name` and `description`: plain sentences; the description is the install-review pitch.
- `homepage` / `repository`: HTTPS only, no embedded credentials.

## 4. Permissions and consent

Six stable permission strings: `commands`, `project.read`, `project.write`,
`selection`, `ui.notify`, `storage`. Nothing is granted by default; the user can
revoke each one per extension in Settings, and a revoked call rejects with
`E_PERMISSION_DENIED` — it never hangs and never silently returns empty.

Beyond the six, the optional `[security]` table declares expanded scopes, all
consent-gated: filesystem outside the project (`read`/`write`: `none`, `project`,
`ask`), exact-host HTTPS network access with a stated reason, secret slots with
header injection, clipboard, and the Somnia Agent (`host-default` models only).
Omitting `[security]` means tier A with none of these rights. The consent engine
and every revocation rule are specified in
[permissions-security.md](./permissions-security.md); the example set has a
[consent](./examples/fs-consent/) and a [network](./examples/network-host-scope/)
walkthrough.

Ask for the minimum. Every permission and reason is review-visible, and expanding
scope in an update requires fresh user consent.

## 5. The development loop

1. Edit files in your extension folder.
2. `validate` after every meaningful change — it is the compiler for your package.
3. `pack` when green; the artifact plus SHA-256 is what you distribute.

Editor integration: run the validate command on save. Errors arrive as
`code pointer message` lines, one per problem, all problems in one run.

Executable packages activate on targets advertising the matching runtime
(`HostCapabilities.runtimes`); browser targets advertise **Wasm only** today, and
unsupported lanes fail fast with `E_INCOMPATIBLE_API`. See
[runtime.md](./runtime.md) for the staged rollout.

## 6. Testing

Layers, cheapest first:

1. **Validate and pack** — schema, semantics, paths, budgets, inventory.
2. **Unit tests with a mock host.** The guest API is plain data and promises, so
   a mock is a few objects. The examples ship exactly such a mock; CI runs every
   example's command handlers through it, including the permission-denied path.
3. **Denied-permission runs.** Always exercise the `E_PERMISSION_DENIED` branch;
   reviewers look for it.

Edge cases worth a test each: empty project, no active editor, revoked
permission mid-session, offline or 5xx host, stale base revision on edit.

## 7. Packaging and the integrity hash

`pack` writes `<id>-<version>.somniax` — a plain ZIP with `somnia-extension.toml`
at its root — and prints the SHA-256 an index entry pins. The package gate is
fail-closed: safe paths only, fixed budgets (25 MiB compressed, 100 MiB expanded,
5,000 files, per-asset caps), no nested archives or native binaries, every
referenced file present. The installer verifies the artifact digest against its
trusted receipt before parsing; your job is simply to keep `pack` green.

## 8. Publishing

The index is a GitHub repository: fork it, add an entry file (name, version,
source URL, SHA-256 from `pack`), open a PR. Index CI re-runs the same
`--lane store` validation; review follows the same checklist as
[chapter 10](#10-security-checklist-for-authors). Publisher verification and the
verified badge are granted after review; the exact publisher registration process
is still being defined and will be documented here first.

## 9. Updating and deprecating

- Bump `version` (stable SemVer, no prerelease tags) and repack.
- An update that **adds** permissions or security scope needs fresh user consent;
  reduced or unchanged scope can be accepted silently. Old consent and sessions
  stay intact until the user approves the expansion.
- To retire an extension, open an index PR marking it deprecated; users keep
  working installs but see the notice.

## 10. Security checklist for authors

Reviewers and `validate --lane store` apply the same list:

1. Minimum permissions declared; each has a user-visible reason where the schema asks for one.
2. Network hosts exact, HTTPS, with `reason`; no wildcards, ports, ambient cookies or auth headers.
3. No `eval`, no remote code loading, no bundled secrets — secret slots only.
4. `dependencies` inventory complete: exact versions, licenses, `sha256:` integrity.
5. Panels: declarative where possible; webview content sanitized, scripts off unless needed.
6. Denied-permission paths handled once, without nag loops.
7. User data only in extension storage; nothing written outside the granted fs scope.
8. Engine ranges pinned with explicit bounds; API inside major 2.
9. No data collection without disclosure in `description`.
10. `validate --lane store` and `pack` green on a clean checkout.

## 11. Versioning and compatibility

SDK `apiVersion` is major-integer with additive minors inside app releases;
`engines.api` keeps your package inside major 2, and `engines.somnia` pins the
app band you tested on. Breaking API changes ship as a new major with a migration
guide per version; deprecated surface is marked with a replacement and a removal
version before it disappears. v2 is the first versioned contract — there are no
migrations yet, and this section will carry them when they exist.

## Where next

- [Manifest reference](./manifest-reference.md) — every field, generated from the schema
- [Error codes](./error-codes.md) — every diagnostic and its fix
- [Examples](./examples/README.md) — buildable, CI-tested starting points
