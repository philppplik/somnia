# Wiki migration plan

Goal: the GitHub wiki becomes a generated mirror of `docs/guide/`. Hand-written wiki pages move into the guide first, so nothing is lost. Nothing is pushed to the wiki until the owner approves.

## Page map

| Old wiki page | Target | Action |
| --- | --- | --- |
| Home | `guide/README.md` | Replace. Keep the release scope and screenshots sections: move them into the guide README before the first sync. |
| Getting-Started | `guide/quickstart.md` | Merge. Quickstart already has install and open. Add the "Choose a release" asset table and the export paragraph. |
| FAQ | `guide/faq.md` | Done in this patch (copied, links rewritten). |
| Studios | `guide/studios.md` | Merge the "Opening and blank documents" and "Modes" text. Most is already in the studio pages. |
| Code-Studio | `guide/studios/code.md` | Merge "Live view in the 12.2 alpha line", "Known limits", "Working safely". |
| Features | `guide/features.md` (new) | Move as is, relabel with status labels. |
| AI-and-Collaboration | `guide/ai-and-collaboration.md` (new) | Move as is. Link from Settings and Vibe Space. |
| Extensions-and-SDK | `guide/extensions.md` | Merge "Store trust" and "v2 developers". |
| Deploy | `guide/deploy.md` | Already covered. Keep the "Before any future server publish" checklist. |
| Frameworks | `guide/frameworks.md` | Already covered. |
| Contributing | `CONTRIBUTING.md` in the repo root, plus a wiki stub | Move. It describes repository work, not product use. |
| Roadmap-and-Releases | `guide/releases.md` (new), `docs/ROADMAP.md` | Move the release baseline and verification part. Keep the roadmap in `docs/ROADMAP.md`. |
| _Sidebar, _Footer | generated | The sync script writes `_Sidebar.md`. Keep the footer by hand or drop it. |

## Order

1. Merge the content of each row into the guide (one commit per page, so a reviewer can compare).
2. Run `node scripts/docs-check.mjs`.
3. Run `node scripts/wiki-sync.mjs <wiki checkout>` and read the diff against the old wiki.
4. Owner approves. Then commit and push the wiki repository.
5. From then on, edit the guide only. Each wiki page starts with a "generated" banner.

## Risks

- The sync overwrites pages of the same name. Old pages without a counterpart stay until they are removed by hand.
- The wiki contains claims checked against specific releases (v12.0.1, alpha.7). Re-check them against the current release notes when merging, and update the status labels.
