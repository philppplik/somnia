# fs-consent

Reads one file from outside the project — only after explicit user consent.

- **Contributions:** command `acme.fs-consent.import-file`
- **Permissions:** `commands`, `ui.notify`, plus `[security.fs] read = "ask"`
- **Teaches:** fs consent scopes (`none` / `project` / `ask`), the install-review
  reason, denial handling without nag loops, `limited` untrusted-workspace mode

The manifest declaration and consent flow are the stable, tested surface. The
`somnia.fs` guest bridge belongs to the trusted filesystem service in
[permissions-security.md](../permissions-security.md): reads are capped at
512 KiB, authorization takes canonical paths from the trusted resolver, and a
denial suppresses repeat prompts (three denials suppress all until a new
session). Targets without the service reject with `E_INCOMPATIBLE_API`.
