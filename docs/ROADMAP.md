# Somnia roadmap

Somnia is a local-first visual HTML/CSS editor (Dreamweaver successor), MIT licensed. This plan lists what ships when, what each version depends on, and the main risks. Time windows are rough estimates for one continuously working builder; they move when Windows testing feedback arrives or CI is red. Windows is tested by the maintainer only, so every release ships with a short Windows checklist.

Release rules: every release comes from a commit whose four CI jobs (frontend, native, windows, macos) are green; notes follow Highlights, Fixes, Known issues, Install, Checksums; installers are unsigned until a signing key exists.

## v9.6.2 (in release, 4 Oct)
Empty start (no starter project), session restore, Project menu (Open folder, Open file, Save, Export, Close), Save dialog with new folder, Export dialog (ZIP, folder, single HTML, Markdown), OS file drop, window size and position restore, find bar below the editor, encode/decode special characters, new themes (Blue Ice, Grape Red, Melon Pink, Coffee Shop, Forest Green), 25 px dialog radius, selection and match contrast, status bar fix.
Depends on: nothing. Risk: new Windows window permissions and drag-drop setting are CI-tested only.

## v9.6.3 (about 1 day)
- Breadcrumbs (DOM path in the status bar, click selects, syncs code and design).
- ~~DOM tree sidebar~~ removed in v9.10: redundant with Layers (which filters by tag, id and class).
- Apply formatting (HTML, CSS, JS) via Prettier standalone, loaded lazily, indentation from Settings, selection or file, undoable.
- Fixes from Windows feedback.
Depends on: element tree already in the store. Risk: Prettier bundle size (lazy chunk, measured and reported).

## v9.7 Drag and drop (about 1-2 days)
Layers drag and drop reorder and re-parent, canvas sibling reorder, drop indicators, undo, keyboard alternative (move up/down, indent/outdent), search result jump already done.
Risk: drop targets inside iframes need the preview bridge; keyboard path ships first so accessibility never depends on pointer DnD.

## v10 Quick wins (about 3-5 days, in two or three releases)
- Diff viewer: file vs file, editor vs disk, vs last save; side by side and inline; highlight and next/previous diff. Builds on the existing source diff and conflict compare.
- Live preview hardening: reload behaviour, linked CSS/JS refresh, error overlay, device frames.
- Container drop and align helpers, positioning tools (spacing guides, align/distribute).
- Benchmarks: large files, many nodes, startup time; published numbers and budgets in CI.
- README and project site positioning; Dreamweaver pain point research turned into small fixes.
- Folder drop, more file types, Open file with save in place (needs a native read/write path command).
Depends on: v9.7 for container drop. Risk: benchmarks may expose editor-core limits; fixes then take priority over features.

## v11 (about 1-2 weeks)
- Table editor (insert, merge/split cells, rows/columns, accessible headers).
- Collaboration spike (ADR-005 draft): CRDT evaluation, local network or relay, presence; a spike and a decision, not a promise of shipping.
- Signed one-click updater (Tauri updater plugin, update manifest on GitHub releases).
Depends on: a Tauri signing key created and stored as a GitHub secret by the maintainer (decision and secret are his, not the builder's). Windows code signing certificate is a separate, paid decision.
Risk: collaboration scope; the spike ends with a go/no-go.

## v12 (proposal, about 2 weeks)
- Component system: reusable blocks with variants, project-level library, import/export.
- CSS tooling: variables panel, class manager, responsive breakpoints editor.
- Accessibility checker (contrast, headings, alt text) feeding the Problems panel.
- Extension index on GitHub with install from inside the app (ADR-003 SDK), curated first-party extensions.
- Optional Git integration (status, diff, commit) using the diff viewer.
Depends on: v10 diff viewer, v11 updater for smooth extension and app updates.

## Microsoft Store (MSIX) - proposal
- Package the Windows build as MSIX and publish it in the Microsoft Store. Microsoft signs store packages, so no paid code signing certificate is needed for that channel. Free for individual developers (to be re-checked on the Partner Center page when the account is created).
- Needs from the maintainer: a Partner Center developer account (created by Philipp, not by the builder), app name reservation, privacy policy URL.
- Builder work: MSIX packaging in CI (Tauri bundle target or makeappx), store listing text and screenshots, update flow decision (store updates replace the in-app updater for this channel).
- Risk: store certification review, MSIX sandbox limits on file access (folder picker works, arbitrary paths may not).

## Open decisions for the maintainer
1. Tauri signing key as GitHub secret (v11 updater).
2. Windows code signing certificate (removes SmartScreen warnings; paid).
3. Collaboration direction after the spike.
4. Microsoft Store: Philipp creates the Partner Center account and reserves the name.
