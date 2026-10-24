# Computer use: risk review before implementation (A9)

Status: preparation only. This is not permission to turn on desktop control.

## Attack surface

An external ACP process is untrusted model output, not a human approval source.
Mouse movement, clicks and keystrokes can send messages, buy things, delete files,
change credentials or affect another app outside the isolated project. Screen
capture can disclose other windows, notifications, secrets and personal data.
Prompt injection in pixels remains untrusted data. A folder grant, MCP grant,
reviewed publisher or verified skill does not grant desktop access.

Coordinates can become stale as windows move. Text can be a shell command. Capture
must not become automatic model context or a raw screenshot stream. Approval of
session start does not approve subsequent effects. Never infer a safe effect from
a click or a key name.

## Proposed boundaries

- Restricted default; no route enabled on Windows or macOS. Linux requires a
  compile-time feature and a separate explicit host platform gate.
- Each session start asks the broker. Its dedicated computer-use session grant is
  neither a folder grant nor an MCP grant, and cannot authorize actions itself.
- Every mouse, keyboard and capture effect asks through an explicit broker route,
  with Model origin and the external agent/session identity in the target/digest.
  A non-cloneable, single-use ApprovalToken is consumed against exact arguments.
- Capture output is a reviewed artifact. It has no raw bytes in audit/transcript
  and no automatic delivery to an ACP process. Disclosure needs a separate review.
- Host UI exposes consent, agent identity, stop/revoke and platform unavailability.
  No agent payload may call the human decision handle or mint a session grant.

## Abort paths

Deny any request; revoke the session grant; stop/cancel the broker run. Each route
checks the live grant and run before consuming an action token. Host integrations
must check cancellation immediately before a side effect and stop their OS adapter
on run cancellation. Token mismatch, timeout, missing adapter, unsupported platform
or missing gate fails closed. Revocation does not undo an already performed click.

## Explicitly not built in this preparation

No global keyboard/mouse hook, clipboard access, accessibility privilege request,
background recording, unattended desktop mode, persistent desktop grant, hidden
portal consent, browser bypass, credential entry, direct capture-to-agent stream,
OS command-string executor or unrestricted desktop backend. No claim that Linux
coordinates are isolated or that consent makes arbitrary desktop actions safe.

The first delivery provides typed proposal/permit and artifact-review boundaries,
not a production input/capture adapter. A later platform gate must review a bounded
Linux portal adapter, foreground ownership, geometry freshness, release of held
keys, cancellation races, redaction and reviewed artifact delivery before activation.
