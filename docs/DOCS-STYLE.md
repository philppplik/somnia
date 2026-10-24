# Documentation style

Applies to everything in `docs/`, `README.md` and the GitHub wiki.

## Language and tone

- English only. Short sentences. Plain words. No marketing language.
- Say what the feature does, then how to use it, then its limits.
- Write limits and failure modes down. Do not hide them.

## One home per topic

- User-facing how-to lives in [`docs/guide/`](guide/README.md).
- How the system works lives in the matching technical doc (architecture, deploy, CLI, extensions, agent).
- Design reasoning and decisions live in `phase1/notes/` (ADRs) and `docs/concepts/`.
- Link to the home. Do not copy text into a second page.

## Status

Every guide page and every feature table says **Stable**, **Pre-release** or **In development** (definitions in the [guide](guide/README.md#status-labels)). Concept docs start with a `Status:` line. Update the label in the same change that ships the feature.

## Page shape

1. Title.
2. Status line.
3. One paragraph on what it is.
4. Steps or reference table.
5. Limits and safety.
6. Links to technical docs.

## Naming

- User guide files: lower-case kebab-case (`quickstart.md`).
- Technical docs keep their existing names. Do not rename without fixing every link (run `node scripts/docs-check.mjs`).
- UI text in bold exactly as shown in the app. Commands and file names in code font.

## Examples and safety

- No real API keys, tokens, passwords, hosts, IPs or personal data. Use placeholders such as `<TOKEN>`, `example.com`.
- Never tell a user to turn off system security.
- Prices and versions: link to the source or the release, or state the date checked.

## Links

- Relative links between docs. Absolute GitHub URLs only for releases and issues.
- Run `node scripts/docs-check.mjs` before you commit docs. It fails on broken relative links.

## Wiki

The wiki is generated from `docs/guide/` by `node scripts/wiki-sync.mjs`. Edit the guide, not the wiki.
