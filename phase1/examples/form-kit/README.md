# Form Kit

Seven snippets for accessible forms plus a right panel that checks an HTML file.

- Snippets (Insert menu): text field with label and hint (`aria-describedby`), fieldset with legend and radio group, field with error hint (`aria-invalid`, `role="alert"`), email, password and phone fields (`autocomplete` + `inputmode`), and a CSS snippet for field styles. Bodies are inserted as written, without tab stops.
- Panel "Form Kit": pick an HTML file and press Check. It reports fields without a label (with line numbers), radio or checkbox groups without a fieldset, fieldsets without a legend, missing `autocomplete` on email, tel and password fields, and `aria-describedby` pointing to a missing id. The file is parsed inert with `DOMParser`; scripts in it never run.

No worker code and no commands, so it is eligible for the GitHub index. See docs/extensions/12-authoring-kit.md.

## Permissions

| Permission | Why |
| ---------- | --- |
| `project.read` | List the HTML files and read the chosen file (including unsaved changes). |

Panels cannot see which tab is open and get no change events, so the file is chosen in the panel and re-read with the Check button.
