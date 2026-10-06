# Translation review: Spanish, French and Brazilian Portuguese

Somnia has five UI catalogues: English (`en`), German (`de`), Spanish (`es`), French (`fr`) and Brazilian Portuguese (`pt-BR`). English is the source catalogue. The Spanish, French and Portuguese strings are machine-assisted drafts, not certified native-speaker translations. The language note in Settings remains visible until a documented review warrants changing it.

## Current change and limits

This pass connects Settings labels, accessible names, appearance options, shortcut controls, update/about messages and extension controls to the catalogues. It translates extension catalogue filters, categories, installation states, package review warnings, permission explanations, update counts and error summaries. Command palette instructions and missing static command titles are included.

Do not translate project HTML/CSS, user file names, extension author/name/description, theme names supplied by extensions, permission identifiers, hashes, package versions or raw provider diagnostics. These are data. An English publisher description or technical error detail in a translated UI is intentional. No package download or installation is implied by choosing a language.

This is **not** a claim that every runtime diagnostic or every newer panel is translated. Remaining source literals should be inventoried before calling the entire app fully localized. A follow-up pass also connects conflict comparison descriptions and confirmation, live-preview consent/error summaries, media empty states, source-diff descriptions, empty-layer states and the app toolbar. These are still machine-assisted translations, without native-language review. Remaining examples include action notices and low-level file-adapter diagnostics, the code-editor context menu, alignment toolbar and breadcrumb accessible names. Windows, Tauri menus and installer strings have not been tested by this pass.

## Review workflow

1. Open a focused issue titled `i18n review: <locale> / <screen>` with the source commit. A reviewer must understand the target language; record their name/handle and date, never infer review from key parity or passing tests.
2. Compare `src/locales/en.json` and the target JSON. Use one feature branch per review. Keep keys stable and changes additive during parallel work. Do not reorder the whole catalogue.
3. Review in context, not just a spreadsheet. Open Settings and visit General, Appearance, Typography, Canvas, Editing, Code editor, Projects, Export, Preview, Shortcuts, Extensions, Updates and About. Desktop-only Window settings need a separate desktop run. Test live locale switching, search, keyboard focus and accessible names.
4. Review extension list, empty/search states, detail, permissions, install confirmation, disabled-after-install state, update banner and error summary. Use deterministic fixture packages from `tests/i18n-finish.spec.ts`, not an unknown live extension. Confirm that a matching SHA-256 is **not** presented as proof of safety and that installation stays off until explicitly enabled.
5. Preserve every `{placeholder}` exactly. Keep `_one` and `_other` forms and test counts 0, 1, 2 and 1,000,000. French and Portuguese plural rules differ from a simple `count === 1` test. Test long names and paths. Keep technical tokens such as HTML, CSS, API, SHA-256, ZIP and permission IDs unchanged.
6. Capture light and dark screenshots at normal UI size and 110%, plus a smaller window. Scroll to reach all controls. Check wrapping, clipped buttons, close control, search field and focus ring. Include a screen-reader/accessibility spot check. Document any truncation, rather than marking the screenshot as clean automatically.
7. Run the commands below and attach actual results. Open a draft PR containing the reviewed strings, screenshots, source commit and unresolved terminology. Another reviewer checks safety/permission wording and placeholder parity before merge. Do not mark a locale reviewed until every listed screen and exception is accounted for.

Run from `phase1`:

```sh
npm ci
npm run typecheck
npm run test:core
npm run build
npx playwright test tests/i18n*.spec.ts tests/extension-catalog*.spec.ts tests/settings*.spec.ts
```

Browser tests exercise the web UI. They do not establish Windows/Tauri correctness. A desktop release needs a separate Windows smoke test, including native dialogs, menu labels and persisted language after restart.

## Locale choices to check

- **es:** Keep broadly understandable Spanish. Review `atajos`, `ajustes/configuración`, `vista previa`, and `permisos` consistently. Avoid translating extension metadata.
- **fr:** Use `vous` consistently. Review `paramètres`, `raccourcis`, `aperçu` and `autorisations`. Check apostrophes, accents and spacing before `:`, `?` and `!`; do not change placeholder syntax to fix typography.
- **pt-BR:** Use Brazilian Portuguese, not European Portuguese. Review `configurações`, `atalhos`, `pré-visualização`, `permissões`, and `arquivo` consistently. The actual picker/tag is `Português (Brasil)` / `pt-BR`.

## Review record template

```text
Locale and screen:
Source commit:
Reviewer and date:
Native-language review: yes / no
Terminology changes and rationale:
Placeholders/plurals checked:
Keyboard and accessible-name checks:
Screenshots and tested viewport/theme/UI size:
Tests run and actual results:
Desktop platforms actually tested:
Unresolved strings or layout issues:
Second reviewer and decision:
```

No native-speaker or Windows sign-off has been recorded by this change. Passing key/placeholder tests only demonstrates structural consistency.
