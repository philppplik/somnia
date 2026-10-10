# Error codes

Every diagnostic the SDK v2 toolchain prints has a **stable code** that is never
reused, an RFC 6901 **pointer** into your manifest (or `/files/<path>` for
package inventory), and a one-line message. The same codes appear in
`somnia-ext-v2 validate`, `pack`, index CI and the install review — one format
everywhere. A package is never partially registered: all errors come back in one
run.

Exit codes: `0` ok, `1` validation errors, `2` usage or tool failure.

- [Manifest and package codes (SOM-EXT-nnn)](#manifest-and-package-codes)
- [Runtime codes (E_\*)](#runtime-codes)

Filter: [all](#manifest-and-package-codes) · errors only — the validator emits no
warnings today.

## Manifest and package codes

Stages: **validate** (`somnia-ext-v2 validate`, install), **index CI**, **pack**.

### SOM-EXT-001 manifest is not readable TOML

`error` · stage: validate · pointer: empty (the document as a whole)

**Cause.** The manifest is not valid UTF-8, has a TOML syntax error, contains a
duplicate key, or exceeds the 256 KiB manifest budget. A syntax error cannot
reliably name a property, so the pointer is empty.

**Fix.** Parse the file with any TOML 1.0 parser; check for duplicate keys and
non-UTF-8 bytes first.

Before:

```toml
manifestVersion = 2
manifestVersion = 2
```

After:

```toml
manifestVersion = 2
```

### SOM-EXT-002 closed schema violated

`error` · stage: validate · pointer: the offending key

**Cause.** The schema is closed at every level: an unknown key, a missing
required key, a value of the wrong type or outside its limits, nesting deeper
than 32 levels, or a reserved property name (`__proto__`, `constructor`,
`prototype`). This is the code authors from permissive ecosystems meet first.

**Fix.** Remove or correct the key the pointer names. Check spelling against the
[manifest reference](./manifest-reference.md) — camelCase is exact.

Before:

```toml
[engines]
somnia = ">=11.0.0 <12.0.0"
apiVersion = ">=2.0.0 <3.0.0"
```

After:

```toml
[engines]
somnia = ">=11.0.0 <12.0.0"
api = ">=2.0.0 <3.0.0"
```

### SOM-EXT-003 semantic contract violated

`error` · stage: validate, index CI · pointer: the offending value

**Cause.** The manifest is structurally valid but breaks a contract rule:
publisher does not equal the ID namespace; a command ID sits outside the
extension namespace; a duplicate contribution ID; an invalid SPDX license; a
command without the `commands` permission or on a `declarative` runtime; a
contribution without a matching activation event (or an activation event naming
nothing); `onSelectionChanged` without the `selection` permission; an unsafe or
unbounded `workspaceContains:` glob; a `when` expression outside the closed
grammar; an unsupported command argument-schema keyword; eager `*` activation in
the Store lane; a non-`.wasm` Wasm entry or non-`.js` JS entry.

**Fix.** Follow the pointer. The most common case is a missing activation event:

Before:

```toml
activationEvents = []
[[contributes.commands]]
id = "acme.hello.say-hello"
title = "Say hello"
category = "Tools"
```

After:

```toml
activationEvents = [ "onCommand:acme.hello.say-hello" ]
[[contributes.commands]]
id = "acme.hello.say-hello"
title = "Say hello"
category = "Tools"
```

Related: [Developer guide — activation](./developer-guide.md#2-anatomy-of-an-extension).

### SOM-EXT-004 engine range or host compatibility

`error` · stage: validate, install · pointer: `/engines/somnia` or `/engines/api`

**Cause.** An engine range without an explicit lower bound or an exclusive upper
major boundary (`>=11.0.0 <12.0.0`, never `*` or tags); the API range outside
major 2; or the actual host version failing the range at enablement. Passing
shape validation does not prove the running app supports SDK v2.

**Fix.** Pin both bounds. `engines.api` must be `>=2.0.0 <3.0.0` (or a narrower
band inside major 2).

Before: `somnia = ">=11"`
After: `somnia = ">=11.0.0 <12.0.0"`

### SOM-EXT-005 unsafe or colliding package path

`error` · stage: validate, pack, install · pointer: the path field or `/files/<path>`

**Cause.** A path that is absolute, uses backslashes, traverses (`..`), has empty
segments, ends in a dot or space, names a Windows device (`CON`, `NUL`, …), uses
a reserved property segment, or collides with another entry by case or Unicode
normalisation — or a file that conflicts with a parent directory. Folder imports
reject symlinks and special files before any bytes are read.

**Fix.** Use forward-slash, package-relative paths only; rename colliding files.
Never resolve an OS path from a manifest value.

### SOM-EXT-006 missing manifest or referenced file

`error` · stage: pack, install · pointer: the referencing field

**Cause.** No `somnia-extension.toml` at the package root, more than one manifest
anywhere, or a file referenced by `runtime.entry`, `icon`, `license` (`SEE
LICENSE IN`) or a contribution `path`/`icon` missing from the inventory.

**Fix.** Add the file or fix the reference. Case must match exactly.

### SOM-EXT-007 package or asset budget exceeded

`error` · stage: pack, install · pointer: `/files` or `/files/<path>`

**Cause.** Over a hard budget: 25 MiB compressed, 100 MiB expanded, 5,000 files,
20 MiB runtime entry, 256 KiB per panel asset, 64 KiB per theme asset, 32 KiB per
snippet asset, 256 KiB manifest.

**Fix.** Ship fewer, smaller assets. Large media belongs outside the package.

### SOM-EXT-008 invalid or forbidden archive content

`error` · stage: pack, install · pointer: `/files/<path>` or the archive as a whole

**Cause.** A corrupt or hostile ZIP (bad central/local headers, overlapping
regions, ZIP64, multi-disk, encryption, unsupported compression, CRC mismatch),
executable permission bits, nested archives, or native executables — detected by
filename and by content signature (`MZ`, ELF, Mach-O, `PK`, gzip, 7z, RAR, tar).

**Fix.** Repack with a plain ZIP writer, no executables, no nested archives.
The installer verifies the artifact digest against its trusted receipt before
this parser runs; CRC is corruption detection, not authentication.

### SOM-EXT-010 security declaration invalid

`error` · stage: validate, index CI · pointer: inside `/security`

**Cause.** A network host that is not a unique exact lowercase DNS name
(wildcards and ports are refused); a network path prefix that is unsafe (no
leading `/`, queries, traversal, encoded separators, a `*` that is not trailing);
a `reason` outside 20–280 plain-text characters; an injection rule without the
declared secret and approved host, with a duplicate header, or targeting a
transport/cookie header; tier `B` submitted to the Store lane.

**Fix.** Declare exact hosts and safe prefixes, write the reason for the install
review, and keep tier `B` to manual `.somniax` installs with Developer Mode.

Before:

```toml
[[security.network]]
host = "*.example.com"
reason = "API"
```

After:

```toml
[[security.network]]
host = "api.example.com"
paths = ["/v1/releases*"]
reason = "Fetch release metadata for the project you opened"
```

Code `SOM-EXT-009` is reserved and currently unused.

## Runtime codes

Runtime failures are typed `ExtensionError`s with stable names. Guest code should
branch on the code, never on the message. Host UIs translate codes and never
surface guest stack traces, absolute paths or document content.

### Guest API codes (`contracts/v2/api.ts`)

| Code | Raised when | Your handler should |
| ---- | ----------- | ------------------- |
| `E_PERMISSION_DENIED` | The user revoked or never granted the permission, or a consent prompt was denied | Degrade the feature, explain once, offer retry via Settings — never nag in a loop |
| `E_WORKSPACE_UNTRUSTED` | The workspace is untrusted and your capability table does not cover the call | Tell the user the project is untrusted; declare `limited` support if you can run with less |
| `E_INVALID_ARGUMENT` | Arguments fail your declared schema or the API contract | Fix the call site; this is a bug in the extension |
| `E_INCOMPATIBLE_API` | App/SDK/protocol/runtime mismatch — e.g. a `js` entry on a Wasm-only host | Check `HostCapabilities` before relying on a runtime or proposal |
| `E_STALE_REVISION` | Your edit's base revisions no longer match the document | Re-read, rebuild the operations, retry once |
| `E_CANCELLED` | The session ended or the call was cancelled (disable, update, revocation) | Stop work; dispose quietly. Late replies never revive a session |
| `E_TIMEOUT` | A host call exceeded its deadline (activation and commands: 5 s) | Retry once, then report to the Problems panel |
| `E_RESOURCE_LIMIT` | A budget tripped: 32 concurrent calls, 100 calls/s, 10 edits/s, frame or storage caps | Batch work, back off, cache reads |
| `E_HANDLER_MISSING` | The host invoked a command whose callback is not registered | Register every command handler in `activate()` before sending `ready` |
| `E_EXTENSION_FAULTED` | Your handler threw | Catch inside the handler and return a result; an unhandled throw faults the extension |

### Consent and security-service codes (`permissionBroker.ts`, `securityServices.ts`, `secretSlots.ts`)

| Code | Raised when |
| ---- | ----------- |
| `E_RESTRICTED_MODE` | First-run review pending; the extension set is restricted until the user confirms |
| `E_FIRST_RUN_CONFIRMATION_REQUIRED` | Settings tried to lift restricted mode without an explicit acknowledgement |
| `E_CONSENT_REQUIRED` | An install review or runtime consent is required before this capability opens |
| `E_SESSION_REVOKED` | Consent changed mid-session; the session's capabilities are closed |
| `E_BLOCKLISTED` | The signed index blocklisted this extension; it stays disabled until re-approved |
| `E_CONSENT_STORAGE_FAILED` | The durable consent write failed; capabilities closed, restricted mode kept |
| `E_DEVELOPER_MODE_REQUIRED` | A tier B install without Developer Mode |
| `E_NATIVE_HOLD_REQUIRED` / `E_NATIVE_STORE_FORBIDDEN` | Native approval needs the 3-second trusted hold; Store packages can never be native |
| `E_VIRTUAL_WORKSPACE_UNSUPPORTED` | The project has no real folder and the manifest opted out of virtual workspaces |
| `E_IDENTITY_MISMATCH` | A session token was presented by the wrong extension or generation |
| `E_STALE_PROMPT` | A consent prompt resolved after invalidation |
| `E_INVALID_MANIFEST` | The manifest bound to a consent decision no longer matches |
| `E_SECRET_REQUIRED` / `E_UNDECLARED_SECRET` / `E_INVALID_SECRET` | A network call referenced a slot the user has not filled, never declared, or that fails the slot-name rules |
| `E_REDIRECT_DENIED` | A redirect crossed hosts, dropped to HTTP, or carried a POST — redirects are manual, capped at five, HTTPS only |

Related: [permissions-security.md](./permissions-security.md) for the consent
engine, [runtime.md](./runtime.md) for supervisor and broker behaviour.
