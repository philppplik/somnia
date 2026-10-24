# Shared-model schema (versioned)

The project `Y.Doc` carries a root map `meta` with `schema: <int>` (see
`src/lib/collab/schema.ts`). The host stamps it when a session is seeded. A build that
reads a version it does not know must refuse to interpret the new layout instead of
guessing; a missing stamp means a pre-schema build (text collab still works).

## schema 1

| Root key | Type | Content |
|---|---|---|
| `files` | `Y.Map<path, Y.Text>` | Shared text files (collabDoc.ts). Host is the only disk writer. |
| `media` | `Y.Map<path, {hash, size}>` | Blob manifest for images/PDFs (blobSync.ts). |
| `meta`  | `Y.Map` | `{ schema: 1 }`. |

Reserved for office sync (no build writes these yet): `office/<path>` root maps holding
the per-file shared model for docx/xlsx/pptx (concept docs/concepts/collab-office.md:
documents `blocks`, sheets `sheets`/`cells`/`rows`/`cols`, slides `slides`).

Migration rule: a later schema adds keys or migrates on first host write; the version
handshake (identity announcement) prevents mixing builds whose office layouts differ.
