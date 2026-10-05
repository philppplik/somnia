# 13. Publish to the GitHub index

The Browse GitHub extensions list is a reviewed JSON file in the Somnia repo (`docs/extensions/catalog/index.json`). Adding an extension is a pull request. The full review rules are in the [index README](catalog/README.md); this page is the author's path.

## Before you start

- The extension has no worker code (no `code`, no `main`). Declarative contributions (commands need code, so: snippets, code themes, panels) are fine. `validate` shows "GitHub index: eligible" when this holds.
- It has a README that explains every permission, and a LICENSE.
- Version is x.y.z. Published versions are never overwritten: new version, new ZIP.

## Steps

1. Pack: `npm run ext -- pack my-ext`. Note the file name.
2. Commit the ZIP to your public GitHub repo, for example `dist/my-ext-1.0.0.zip`, and tag the commit (`v1.0.0`). Release download URLs are not accepted because they redirect; the index needs a raw.githubusercontent.com URL.
3. Print the entry. The hash is computed from the exact ZIP bytes:

   ```
   npm run ext -- entry my-ext-1.0.0.zip my-ext --repo https://github.com/you/my-ext --ref v1.0.0 --path dist/my-ext-1.0.0.zip --author "Your Name" --description "One sentence, plain text."
   ```
4. Open a PR against `philppplik/somnia` that appends the entry to `extensions` in `docs/extensions/catalog/index.json`. Link your repo and say which permissions you ask for and why.
5. Reviewers read the source, rebuild the hash from your ZIP and check identity and permissions against the manifest. A matching hash proves the bytes match, not that the extension is safe.

## After publishing

To update, pack the new version, commit a new ZIP, and send a PR that changes the entry (version, download, sha256). Users who replace an installed catalog extension get it switched off and must enable it again.
