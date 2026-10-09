# Extension management UX (design proposal)

Status: design only, no app code changed. Base: `somnia-agent` at 1d014e1. Mockups are static HTML in `mockups/` (`gen.js` generates them, they use the real `tokens.css`), with PNG renders next to them. They are prototypes, not shipped UI.

| Screen | File |
|---|---|
| Installed list | `mockups/01-installed.png` |
| Browse catalog | `mockups/02-browse.png` |
| Install review (permission prompt) | `mockups/03-install-review.png` |
| Manage one extension, per-permission toggles | `mockups/04-manage-permissions.png` |
| Update review with permission diff | `mockups/05-update-review.png` |
| Remove confirm and error states (dark, Midnight palette) | `mockups/06-remove-and-states-dark.png` |

## Structure

Settings > Extensions gets three tabs in a pill switcher: **Installed**, **Browse**, **Updates (n)**. Today everything sits on one scrolling page and the catalog is a bordered box inside it. Each extension is a bento card: icon, name, version and source, one-line description, and a row of pills. Tapping Manage opens a detail page, not a modal, so the permission list has room.

## Rules

1. **Off after install.** Matches `06-lifecycle.md`. The install dialog offers "Install, keep off" and "Install and turn on".
2. **Risk is visible in the list.** Pills reuse the existing tiers from `MARKETPLACE-UX.md` (No permissions, Low access, Reads/Changes your project). Text only, never color alone. "Low access" never means "safe".
3. **Plain-language permission rows.** Each row shows the real permission id in mono plus one sentence. Sentences are in the mockups; they follow the table in `03-permissions.md`.
4. **Per-permission revoke, immediate.** A toggle per permission, no restart (this is how `03-permissions.md` already behaves). The detail page says what breaks when a permission is off, using the host's real error.
5. **Update keeps choices, new permissions start off.** Update review lists each permission as Unchanged or NEW. Users can allow a new one inline.
6. **Remove is a confirm dialog** that says what is deleted (manifest, enabled flag, storage) and that project files are untouched.
7. **No numbers we cannot back.** No ratings or download counts, same as the earlier proposal.
8. **Failure is shown on the card**: "Failed to start" turns the extension off and links to Problems; "Can't reach GitHub" only affects Browse.

## Accessibility notes

Toggles are real switches with a name that includes the extension and the permission (as the current checkboxes already do). Dialogs trap focus and return it to the opener. The result count and update banner use `role=status`. Status pills carry text. Contrast uses the existing tokens only.

## Assumptions (not verified against the code)

- **A1.** Install-time toggles in the dialog (letting the user deny a permission before installing) are new. Today the user can only revoke after install. If the extension does not handle denial, this is a risk; the docs tell authors to handle it.
- **A2.** "New permissions start off on update" is new behavior. `06-lifecycle.md` says same-id installs keep enabled flag and revoked permissions, which implies a new permission would be granted by default. This needs a code change in the registry and a docs update.
- **A3.** The Updates tab and per-card "Update 1.1.0" pill need the installed version compared with the index. `catalogView.ts updatesAvailable` already exists. The "What changed" line needs a new optional `changelog` field in the index (schema bump); otherwise omit that line.
- **A4.** Word count 1.1.0, Page Outline and the "Failed to start" state are invented to show the states. The index currently holds only Quiet Colors. Section Kit, Word count and Safe external links are the local examples under `phase1/examples`.
- **A5.** Category chips (Themes, Panels, Tools) are illustrative; real categories come from `CATEGORIES` in `catalogView.ts`.
- **A6.** Pill "No network, no file writes" is true for apiVersion 1 as documented (no network or filesystem permission). `project.write` still edits the project through editor operations, so the pill shows only on extensions without it.
- **A7.** "Runs code" and "Not from the catalog" pills: the GitHub catalog refuses worker `code` (see `13-publish-to-index.md`), so any extension with code was installed locally. The native CSP conflict for worker extensions is not addressed here; this design only labels it.
- **A8.** Strings are English here. All real strings need keys in the 5 locales.
- No pen-and-paper user testing was done.

## Out of scope

Catalog changes, merging, runtime or CSP fixes, new extension points (AI, studios, git, diagnostics). A "Verified by Somnia" label stays off until a review process exists.
