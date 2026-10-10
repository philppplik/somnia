# Native argv parser (12.0.1)

`intake::parse::parse_open_args(args, sender_cwd, policy)` is shared by cold
`args_os()` and second-instance arguments converted to `OsString`. Pass the
executable as argv[0]; it is skipped once. It returns every accepted item in
order and every rejection. Candidate ordinals are zero-based and exclude flags,
flag values and empty arguments. Rejected candidates retain their ordinal.

## Flags and limits

`--` ends flag interpretation, including known flags. Before it, switches never
become paths. Recognized switches without values are `--verbose`,
`--no-default-plugins`, `--help`, `-h`, `--version` and `-V`. `--config`,
`--profile` and `--log-level` consume the next argument. Their `--flag=value`
forms are discarded as switches. Unknown switches are ignored without consuming
the next argument, including single-instance pipe artifacts.

At most 64 nonempty file candidates are processed. Candidate 65 and later are
`TooManyFiles`, while the first 64 keep their outcomes. The path budget is 4096
encoded OS-string bytes; the complete argv budget is 32768 bytes, including the
executable, switches and values. Values exactly at the limits are allowed.
After argv exceeds the budget, remaining file candidates are `ArgvTooLong`.
Limits and shape policies run before any filesystem access. The resolved
path is checked again, so a relative argument cannot bypass the UNC/device
policy or path budget through the sender cwd. Parsing performs no
file-content reads and acquires no project locks.

## Access policy

URL schemes matching an ASCII letter followed by ASCII letters/digits/`+.-`
then `://` are rejected, including `file://`. Scheme matching is case-insensitive.
Device namespaces `\\?\` and `\\.\` are always rejected. Slash variants are
also rejected. UNC `\\` and `//` prefixes are rejected unless the host's
`IntakePolicy.allow_unc` is true. Enabling UNC does not allow devices or URLs.
Relative paths use the sender's cwd, never the first process's cwd.

Canonicalization and one explicit metadata pass validate a regular file, size
and `identity_of(&canonical, &metadata)`. The identity module owns the token;
the parser neither invents it nor logs it. Directories and non-regular paths
are `Directory`; unavailable paths are `NotFound`. Invalid cold OS-string
Unicode fails closed as `NotFound`, rather than opening a different existing
file named with replacement characters. Warm-plugin replacement strings are
ordinary Unicode and undergo normal filesystem validation.

The parser is filesystem-synchronous. **Never run enabled-UNC validation in a
Windows message callback**: enqueue raw ingress for a bounded asynchronous
worker first. Blocked UNC/device/URL cases require no stat. Network timeout,
queue scheduling and settings persistence belong to the intake host, not this
parser.

## Diagnostics ownership

The parser emits no events. Enqueue owns exactly one `SOM-APP-011` warn per
ordinary rejection, with `expected: true` only for `unc-blocked`, `url`, `device`
and `directory`. Missing, invalid or oversized paths are not expected policy
outcomes. `TooManyFiles` and `ArgvTooLong` instead map to `SOM-APP-008`, with
causes `files` and `length`. No second parser event or ack event is emitted.
The queue owns correlation and incidents and tests the `parse-reject` fault
point's exactly-one-event boundary.

`ParsedItem.display_name` and canonical paths are UI/native data only. They
must never enter logs or diagnostic exports. `RejectedItem.ext` is optional,
ASCII alphanumeric and at most 16 bytes, so it cannot carry arbitrary argument
text. Full path/argv/filename data must not be passed to an event sink.

## Verification and integration

Parser tests use the production parser with real temporary files for acceptance,
canonicalization, metadata, identity, Unicode and ordering. A private inspection
hook asserts policy/limit rejects happen before filesystem access; it does not
replace production acceptance tests. No skipped, ignored or placeholder tests.
Linux-only filesystem features have compile-time Unix tests, not skipped tests.
Windows installed MSI/NSIS and real enabled-UNC share validation remain separate
platform verification, not claimed by these unit tests.

Run:

```sh
cargo test --manifest-path phase1/src-tauri/Cargo.toml --no-default-features
cargo clippy --manifest-path phase1/src-tauri/Cargo.toml --no-default-features --lib --tests
```

Integration order: S6 supplies `intake/identity.rs`, `intake/policy.rs`,
`intake/mod.rs` and lib registration; add `pub mod parse` there. S4 replaces
`startup_file::capture` in desktop setup with the shared parser/queue path and
removes the legacy `startup_file` module/file. Do not replace capture with
`parsed.items.first()` or discard rejects: that loses the batch and warnings.
The legacy module is deliberately unchanged in this parser-only patch so it
cannot break S4's independently owned desktop integration.
