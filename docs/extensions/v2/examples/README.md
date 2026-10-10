# SDK v2 example extensions

Buildable, CI-tested starting points. Every folder is a real package: the
dev-docs workflow validates the manifest, assembles the package through the same
gate the installer runs, and unit-tests the entry's command handlers against a
mock host — including the permission-denied path.

| Example | Contributions | Permissions | Teaches | Backed by |
| ------- | ------------- | ----------- | ------- | --------- |
| [hello-panel](./hello-panel/) | command, declarative panel | `commands`, `ui.notify` | activation events, view trees, the dev loop | [Quickstart](../quickstart.md) |
| [fs-consent](./fs-consent/) | command | `commands`, `ui.notify`, `[security.fs] read="ask"` | fs consent, denial handling, limited untrusted mode | [Developer guide ch. 4](../developer-guide.md#4-permissions-and-consent) |
| [network-host-scope](./network-host-scope/) | command | `commands`, `ui.notify`, one `[[security.network]]` host | exact-host network scope, offline handling | [Developer guide ch. 4](../developer-guide.md#4-permissions-and-consent) |

Validate any example from `phase1`:

```
npx tsx scripts/somnia-ext-v2.ts validate ../docs/extensions/v2/examples/<name>
```

The `somnia.fs` / `somnia.net` guest bridges used by two examples belong to the
consent services in [permissions-security.md](../permissions-security.md); the
manifest declarations those bridges enforce are the stable, CI-tested part.
