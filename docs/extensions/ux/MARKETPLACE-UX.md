# Extension marketplace UX: research and proposal

Status: proposal plus first quick wins (branch `ext/ux-research`, base PR #111). Scope: the in-app extension browser in Settings > Extensions.

## 1. What other products do

Sources were read on 2026-10-05 (search excerpts, not full audits).

| Product | Pattern worth copying | Pattern to avoid for Somnia | Source |
|---|---|---|---|
| VS Code | Each list row shows description, publisher, download count and a five-star rating. Selecting a row opens a details page. Runtime security docs warn plainly that extensions can run malicious code. | Counts and ratings need a central service. Somnia's index is a static GitHub file, so no fake numbers. | https://code.visualstudio.com/docs/configure/extensions/extension-marketplace , https://github.com/microsoft/vscode-docs/blob/c775dd9b/docs/configure/extensions/extension-runtime-security.md |
| Obsidian | Community plugins are off by default ("Restricted mode") and the user must opt in knowingly. A dedicated security page explains the risk. | A single global switch is coarse. Somnia already asks per extension. | https://obsidian.md/help/plugin-security |
| Figma | Community apps pass a written review before listing. Publishing rules are public. | Human review does not scale for a solo project yet. | https://help.figma.com/hc/en-us/articles/34963247780247-App-review-guidelines |
| Webflow | Apps are installed per site or workspace from a Marketplace; scope of install is explicit. | Needs accounts and OAuth. Out of scope. | https://help.webflow.com/hc/en-us/articles/33961266872211-Webflow-Apps-overview |

Takeaways: (1) users scan a list by name, publisher and one line of text, (2) trust signals must be visible before the install click, (3) opt-in beats silent background activity, (4) honest wording matters more than badges.

## 2. Principles for Somnia

1. No background network. Browsing stays an explicit opt-in (already true).
2. Show risk in the list, not only in the review step.
3. Never show numbers we cannot back (no ratings, no download counts until a real source exists).
4. Installed stays off until the user enables it (already true).
5. Everything keyboard and screen-reader reachable.

## 3. Proposed layout (described mockups)

**A. List (Settings > Extensions > Browse)**
```
[Search extensions.............]  Sort by [Best match v]
3 of 3 extensions
+--------------------------------------------------+
| Quiet Colors  v1.0.0 by Somnia                   |
| A calm code theme with light and dark colors.    |
| [No permissions]  Not installed.                 |
| Source on GitHub                  [Review Quiet] |
+--------------------------------------------------+
```
Risk badge text: "No permissions", "Low access" (commands, selection, notifications, storage), "Touches your project" (project.read, project.write). Badge is text, never color alone.

**B. Review step (exists):** keep. Later: put the risk badge in its heading.

**C. Installed row with update (done in list):** when the index has a newer version than the installed one, the row says "Update available" and the button reads "Review update for X".

## 4. Quick wins implemented in this branch

- Multi-word search, every word must match; name ranks above author, author above description (`catalogUx.ts: matchScore`).
- Sort: Best match, Name, Fewest permissions.
- Result count line (`3 of 3 extensions`), announced as a status.
- Permission risk badge per row.
- Update-available detection using numeric version compare (1.10 > 1.9).
- Tests: `src/lib/extensions/catalogUx.test.ts` (unit), `tests/extension-ux.spec.ts` (browser).

## 5. Later backlog (not built)

1. Details drawer per extension (full permission list, source link, hash, changelog).
2. Categories or tags field in the index schema (needs schemaVersion bump and docs).
3. "Verified by Somnia" label, only once a real review process exists. Do not add it before.
4. Installed-extension list: show update badge there too and a one-click "Review update".
5. Ratings or install counts only if a real source (for example GitHub stars via the repo link) is chosen and disclosed.
6. Screenshots or preview of a code theme in the list.

## 6. Risks

- Risk badges are a coarse summary. The permission list in the review step remains the source of truth. Wording says "Low access", never "safe".
- Sort by "Fewest permissions" must not read as a safety ranking. Label kept literal.
