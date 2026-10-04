# 10. Troubleshooting

## Install errors

| Message | Fix |
| ------- | --- |
| `Not valid JSON.` | Check commas and quotes. Escape quotes inside the `code` string (`\"`) and use `\n` for line breaks. |
| `"id" must look like vendor.name ...` | Use lowercase letters, digits and dashes with at least one dot, for example `acme.hello`. |
| `"version" must be x.y.z.` | Use three numbers, for example `1.0.0`. |
| `"apiVersion" must be 1; this host does not support N.` | Set `apiVersion` to 1, or update Somnia if you target a newer API. |
| `Unknown permission: x.` | Use only the names in [Permissions](03-permissions.md). |
| `Commands need the "commands" permission.` | Add `"commands"` to `permissions`. |
| `Command id x must start with "<extension id>.".` | Rename the command id to start with your extension id and a dot. |
| `contributes.commands[i] needs id, title and a known category.` | Use `Project`, `Edit`, `View`, `Insert`, `Tools` or `Help`. |
| `codeThemes[i]: --x must be one of ...` | Only the four `--syntax-*` tokens with hex colors are allowed. |
| `File is larger than 300 KB.` | Reduce the manifest size or move data out of `code`. |

## Runtime problems

| Symptom | Cause and fix |
| ------- | ------------- |
| Nothing shows after install | Extensions are off by default. Switch it on in Settings > Extensions. |
| Command is missing in Ctrl+K | The extension is off, or the manifest does not declare the command. |
| `<command> has no code in this extension.` | Add a `code` field. |
| `No handler registered for <id>.` | The code threw before `commands.register`, or registered another id. Check the status bar for the error text from your code. |
| `<method> needs the "<permission>" permission ...` | Declare it in the manifest, or re-check it in Settings > Extensions if it was revoked. |
| `<name> did not finish in time.` | The handler took more than 5 seconds. Do less work per command. |
| `Select a source container before inserting a snippet.` | HTML snippets insert into the selected element; select one first. |
| Panel is blank or images do not load | The panel has no network. Use inline scripts and `data:` URLs. Check for script errors in your HTML. |
| `Operation file must be a file of the open project.` | The `file` in an operation must be an existing project file such as `index.html`. |
| `Extension is not active.` | The extension was disabled while its panel was open. Enable it again. |

## Still stuck

Open an issue with the manifest (without private data) and the exact message at https://github.com/philppplik/somnia/issues.
