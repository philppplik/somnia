# Settings and editor appearance

Feature branch: `feature/settings-appearance`, based on `phase1-foundation`.
Scope: private desktop alpha. No main merge, public release or live-site deployment.

## Design

- Base UI dialog with a section sidenav: Appearance, Code editor, Components, Connections.
- `Mod+,` opens the dialog; Escape and Close dismiss it. Base UI owns focus trapping/restoration.
- Appearance state is editor-local, never stored in project HTML/CSS or the recovery journal.
- `somnia.appearance` localStorage stores `contrast` and `codeTheme`; malformed values fall back safely. Persistence errors show a notice rather than claiming success.
- Light/Dark retains the existing app preference. High contrast changes the shell text, background, border and focus tokens. It is a stronger-contrast option, not an audited accessibility certification.
- Classic, Ocean, Forest apply CodeMirror HighlightStyle via CSS variables. Direct dependency on `@lezer/highlight` avoids relying on hoisting.
- Source model remains the owner of document changes and undo. Theme changes do not reset the CodeMirror document or add undo entries.
- Components and Connections explain planned work only; no account, folder connection or component storage is created here.

## Verification

2026-10-02: TypeScript/Vite build passed; 26 core tests and 19 browser tests passed. Settings E2E covers open/dismiss, high contrast, syntax theme, reload persistence, unchanged source and source edit/shared undo after changing appearance. Light/Dark high-contrast dialog captures were inspected for clipping/readability.

Build still warns about the initial bundle size. Native folder/save/recovery and Windows GUI acceptance remain separate open items; browser tests do not establish them. This feature is not present in the already-shared Windows 0.1.0 installer.

## Development practice

Features use scoped branches and technical notes. Review PRs target the development foundation, not main. Validation and artifact workflows must stay read-only after any bounded source import. Nothing here authorizes deployment or main merges.
