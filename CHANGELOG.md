# Changelog

## 11.2.0-beta.1 - 2026-10-07

- Direct OpenAI/Claude BYOK providers, live catalogs and metadata-only auth.
- Native fixed-endpoint streaming transport with OS-side saved-key resolution.
- Token batching, stopped/interrupted partial answers, safe errors and explicit retry.
- Existing cloud consent, review-only writes and macOS ad-hoc checks retained.

## 11.1.1-beta.1 - 2026-10-07
- Agent: remember provider/model locally and API key in the OS credential store. No plaintext key fallback.
- Agent: create, edit, delete and enable custom prompts, persisted locally and included in every AI provider request. Cloud consent and file access approval remain separate.


- macOS: explicitly ad-hoc sign the complete app bundle, including sealed resources.
- CI: verify DMG integrity and signatures in the app, mounted DMG and updater archive.
- macOS still requires a security exception: this beta is not Developer-ID signed or notarized.

Changes are grouped by product release. Release notes and installation guidance
live in [`docs/releases/`](docs/releases/). Entries describe implemented behavior,
not roadmap promises.

## 11.1.0 - 2026-10-07

This entry collects the beta.6 wave and the features already present in
11.0.0-beta.5. It was released from the commit that passed CI; Windows and macOS acceptance testing by the maintainer is still outstanding. See the
[release-notes draft](docs/releases/v11.1.0.md) for limits and release checks.

### Added

- Collaboration identity from the local profile: Join prefills the profile name;
  a successful join can save a name into an empty profile without overwriting an
  existing one. Hosts use their profile name or the Host fallback. Session-only
  48 x 48 JPEG avatars appear in chat and the mention picker, with initials as
  the fallback. Mentions keep participant IDs rather than matching names alone.
- A session-only Chat button above Agent in the right rail, an unread badge
  capped visually at `9+`, and `Mod+Alt+C` to toggle chat. Opening Agent switches
  back to the Agent tab; ending a session returns the panel to Agent.
- Glass v2: 0-100% opacity, 0-40 px CSS blur, and separate Window frame, Panels
  and Code editor scopes. The Code editor scope is off by default and warns
  below 60% opacity; measurable low-contrast combinations below 55% get a 55%
  floor. Unsupported native backgrounds and high contrast remain solid.
- LaTeX stage 1: lazy-loaded KaTeX formulas in Markdown, `.tex` syntax
  highlighting and a limited text/math preview. Formula errors feed Problems,
  the editor gutter and the status bar. Trust-requiring KaTeX commands are
  blocked; `.tex` file, include and write commands are never executed.
- Native Markdown editing with Source, Split and Preview views, an icon toolbar,
  link and code-block dialogs, list continuation, `Mod+B`/`Mod+I`, bidirectional
  block-based scroll sync, Reveal in source and relative project-file links.
  Preview supports tables, task lists, footnotes and heading anchors. Raw HTML
  is disabled and remote images are not fetched.

### Included from 11.0.0-beta.5

- Encrypted, session-only chat with plain-text messages, replies, participant-ID
  mentions, attachments and local unread state, plus activity-aware code badges.
  Chat is separate from project files, saves, recovery, export and AI context.
- Save, window-close and Close Project dialogs share the Export-style shell,
  file card and action layout. The save dialog shows the actual new-folder name;
  close dialogs keep explicit save/keep, discard and cancel choices.
- Glass blur and inner-panel controls, persisted appearance settings, and a
  configurable 0-25 px outer corner radius. Dialog and control radii remain
  separate from the outer-radius setting.

### Fixed

- Chat uses the shared outer-radius token and no longer duplicates its opener
  in the status bar.
- The Markdown preview uses the KaTeX pipeline with source-line mapping retained.
  Formulas are inserted into text positions, never into HTML attributes; code,
  escaped dollar signs and price-like text remain protected.

### Limitations

- LaTeX preview is not a compiler: no PDF compilation, package processing,
  BibTeX or `\label`/`\ref` support. `align` has one number per block.
- Markdown preview is read-only, including rendered task checkboxes. Scroll sync
  maps rendered blocks, not exact pixel positions. Remote images remain absent.
- Glass needs successful Windows Acrylic/macOS Vibrancy activation. Web, Linux,
  high contrast and failed native activation use opaque backgrounds. CSS blur
  and radius controls do not override the OS desktop blur or window mask.
- Collaboration profile names and avatars are session presentation, not verified
  identity. Chat has bounded history/attachment limits and no persistent archive.
  Native Windows/WebView2 and two-PC LAN/firewall acceptance remain release gates.
