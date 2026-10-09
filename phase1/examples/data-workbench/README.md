# Data Workbench

Right panel that loads a `.csv`, `.tsv` or `.json` file from the open project, shows it as a table and validates it: empty fields, non-numeric values in number columns and invalid email addresses. It can produce the data as JSON or as an HTML table in a text box you can select and copy by hand. Nothing is written to the project. No network, no clipboard access.

No worker code and no commands, so it is eligible for the GitHub index. See docs/extensions/12-authoring-kit.md.

## Permissions

| Permission | Why |
| ---------- | --- |
| `project.read` | List the project files and read the chosen file (including unsaved changes). |
| `storage` | Remember the last file you loaded. |

## Notes

- Delimiter (comma, semicolon, tab) is detected from the header row. Quoted fields are supported.
- Number and email columns are detected from the header name and the content (60% rule). Row numbers count data rows without the header.
- The panel reads at most 5000 rows and previews 100. It has no change events: press Load to re-read.
- Project data is only parsed as text and shown with `textContent`. Nothing from the file is executed.
