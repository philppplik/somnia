# Locale Parity

Right-side panel that compares locale JSON files against a base language: missing keys, extra keys, placeholder differences (`{name}` in the base but `{nom}` in the translation), and empty translations. Nested keys are flattened to `a.b.c`.

No worker code, so it is eligible for the GitHub index. See docs/extensions/12-authoring-kit.md.

## Layouts it understands

- `locales/en.json`, `locales/de.json`
- `locales/en/common.json`, `locales/de/common.json`
- `i18n/messages.en.json`, `i18n/messages.de.json`

A set needs at least two files. If the project has several sets, pick one in the panel.

## Permissions

| Permission | Why |
| ---------- | --- |
| `project.read` | Reads the locale JSON files of the open project (including unsaved changes). |
| `storage` | Remembers which locale you chose as the base language. One key, `base`. |

Nothing is written to the project and nothing leaves the panel (no network). Values are shown with `textContent`.

## Notes

Plural suffixes (`_zero`, `_one`, `_two`, `_few`, `_many`, `_other`) count as one key, because languages have different plural forms. Placeholders checked: `{name}`, `{{name}}`, `${name}`, `%s`, `%d`, `%1$s`, `%(name)s`, and the name part of ICU `{count, plural, ...}`. Translation quality is not judged. Press Compare after editing; the panel gets no change events in apiVersion 1.
