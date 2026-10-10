# network-host-scope

Calls exactly one declared HTTPS host, with a reason the install review shows.

- **Contributions:** command `acme.network-host-scope.check-releases`
- **Permissions:** `commands`, `ui.notify`, plus one `[[security.network]]` host scope
- **Teaches:** exact-host declarations (no wildcards, no ports), path prefixes
  with one trailing `*`, required `reason` text, offline and denial handling

Hosts are unique exact lowercase DNS names. Omitted `paths` covers the whole
host; an empty `paths` list covers nothing. The trusted proxy disables automatic
redirects and ambient credentials, enforces HTTPS, reinjects only the
destination's own declared secret, and never returns headers to the guest. See
[permissions-security.md](../permissions-security.md). This example stays in
untrusted-workspace `unsupported` mode: network calls and untrusted projects do
not mix.
