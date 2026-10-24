# Documentation plan

Goal: one consistent, English, current set of docs, with an index, a page per area, a quickstart, troubleshooting and a wiki that is generated from the repo.

## Structure

| Layer | Location | Audience |
| --- | --- | --- |
| User guide | `docs/guide/` | People who use the app |
| Technical reference | `docs/*.md`, `docs/<area>/` | Contributors, integrators |
| Concepts and decisions | `docs/concepts/`, `docs/decisions/`, `phase1/notes/` | Why it is built this way |
| Wiki | generated from `docs/guide/` | Browsing on GitHub |

Rules are in [DOCS-STYLE.md](DOCS-STYLE.md).

## Done in the first pass

- Docs index rewritten with an audience map ([README.md](README.md)).
- User guide: quickstart, studios, hero actions, deploy, frameworks, command line, extensions, settings, troubleshooting.
- Status labels on every guide page.
- Link checker: `node scripts/docs-check.mjs` (fixed 3 broken extension example links).
- Wiki generator: `node scripts/wiki-sync.mjs`.
- Patch 2: one guide page per studio (`docs/guide/studios/`), hero-action status matched to the feature branches, root handover docs moved to `docs/handover/` and `docs/research/` with links fixed.

## Next

1. Deepen the studio pages: shortcuts, panel-by-panel walkthroughs, screenshots. Pages exist; Photos, Design and Vibe Space need a check against the running app.
2. Deploy tutorial with a worked, placeholder-only example once a real-server acceptance run exists. Until then the page stays a status boundary plus the verified mechanics.
3. Frameworks: one table per supported framework (template, preview, build, known limits) once beta.2 notes are final. Add Next, Astro, Nuxt and SvelteKit only when shipped.
4. Hero actions: replace the "planned" table with shipped behaviour per studio, with shortcut and menu entry.
5. Continue moving loose root-level technical docs into topic folders (e.g. `VECTOR*.md`, `PHOTOS-*`, `PDF-FORMS.md`), fixing links in the same change.
6. Add the docs checker to CI as a docs-only job (no Actions minutes beyond the existing budget; run it in the existing lint job).
7. Per-release: update the status labels from the release notes and regenerate the wiki.
8. Translations: only UI strings are translated today. Docs stay English.

## Open items

- `docs/deploy-commands.md` links to `concepts/live-deployment.md`, which lives on `docs/deploy-frameworks-concept` and is not on `int/shell`. The link resolves once that branch is merged.
- The wiki is edited by hand today. After the first sync, treat it as generated.
