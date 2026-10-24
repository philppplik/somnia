# Extensions

Status: **Stable** for apiVersion 1 (commands, snippets, code themes, side panels). The extension store with verified publishers and the security model v2 are **In development**.

Extensions are off until you switch them on. They run offline and can only do what their declared permissions allow.

## Install

Settings > Extensions > Add from a .json file, or browse the GitHub extension index. Switch the extension on, press **Ctrl/Cmd+K** and run its command. See [Packaging and install](../extensions/09-packaging-install.md) and [Install from the app](../extension-install.md).

## Build one

Follow the [tutorial](../extensions/08-tutorial.md). Reference: [manifest](../extensions/02-manifest.md), [permissions](../extensions/03-permissions.md), [API](../extensions/04-api-reference.md), [panels](../extensions/05-panels.md), [security](../extensions/07-security.md), [authoring kit](../extensions/12-authoring-kit.md), [publish to the index](../extensions/13-publish-to-index.md), [troubleshooting](../extensions/10-troubleshooting.md).

Full index: [extensions/README.md](../extensions/README.md). Store design: [extensions-store.md](../extensions-store.md).

## Installing, trust and v2 (from the former wiki page)

Extensions add supported commands, snippets, code themes and panels. The legacy SDK and v2 package/runtime lane are different contracts. Do not mix their manifests or assume a proposal is released.

### Installing

Open the Extensions interface and review the source, requested permissions and compatibility before enabling an extension. The newer documented popup has Store, Installed and Add paths. Manual paths accept supported files/folders or manifest text; v2 packages use `.somniax` with `somnia-extension.toml`, while legacy v1 uses `somnia-extension.json`.

Installs and runtime support depend on the build. Restricted Mode prevents execution. An installed/listed item is not proof that its executable runtime is supported. Native/Tier B packages need developer-mode and additional manual consent; they are not Store installs.

### Store trust

A matching SHA-256 proves agreement with the catalog's bytes, not publisher identity or safety. Do not interpret a catalog label as a security audit. The documented baseline has an unsigned catalog and no verified-publisher proof. Blocklist behavior is conditional on the host's configured trusted key/feed.

The older install guide records v2 packages that can be listed but do not execute; the later v2 runtime guide describes a bounded bare-Wasm browser lane and still does not claim a working desktop process factory. Check your release and the relevant host implementation rather than assuming every SDK runtime is available.

### Build a legacy v1 extension

The [SDK index](https://github.com/philppplik/somnia/blob/main/docs/extensions/README.md) covers concepts, manifests, permissions, APIs, panels, lifecycle, security, packaging and versioning.

1. Follow the [tutorial](https://github.com/philppplik/somnia/blob/main/docs/extensions/08-tutorial.md).
2. Use the [manifest reference](https://github.com/philppplik/somnia/blob/main/docs/extensions/02-manifest.md) and declare only needed permissions.
3. Validate and package with the [authoring kit](https://github.com/philppplik/somnia/blob/main/docs/extensions/12-authoring-kit.md).
4. Test locally in the intended desktop build before following [index publication](https://github.com/philppplik/somnia/blob/main/docs/extensions/13-publish-to-index.md).

### v2 developers

Read [v2 runtime integration](https://github.com/philppplik/somnia/blob/main/docs/extensions/v2/runtime.md) for the SDK/protocol split, activation, RPC validation, budgets and runtime limits. Do not add unrestricted Node/JS fallbacks for unsupported execution. Studio extension points and older security-design pages can be proposals, not shipped APIs.

Further evidence: [installation guide](https://github.com/philppplik/somnia/blob/main/docs/extension-install.md), [Store trust model](https://github.com/philppplik/somnia/blob/main/docs/extensions-store.md), and [source modules](https://github.com/philppplik/somnia/tree/main/phase1/src/lib/extensions).
