# 5. Panels

A panel is an HTML page that Somnia shows in the left or right side area. Its rail icon appears next to the built-in panels.

```json
"contributes": {
  "panels": [{
    "id": "files",
    "title": "File list",
    "side": "right",
    "html": "<ul id='l'></ul><script>somnia.project.listFiles().then(f=>{l.innerHTML=f.map(x=>'<li>'+x+'</li>').join('')})</script>"
  }]
}
```

The panel id becomes `<extension id>.<panel id>`. Requires no permission to exist; the calls it makes need their permissions.

## How it runs

- The HTML is placed in an iframe with `sandbox="allow-scripts"` (no same-origin access, no top navigation, no forms, no popups). The frame can still navigate itself; Somnia removes it on any second load (see 07-security.md).
- A Content-Security-Policy of `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:` blocks all network requests. Inline scripts and styles work; external scripts, fonts, images and fetch do not. Use `data:` URLs for images.
- The page body has 12px padding and a system font. Style it yourself.

## Panel API

`window.somnia` in a panel is read-only and smaller than the worker API:

| Method | Permission |
| ------ | ---------- |
| `somnia.project.listFiles()`, `somnia.project.readFile(path)` | `project.read` |
| `somnia.selection.get()` | `selection` |
| `somnia.storage.get(key)`, `somnia.storage.set(key, value)` | `storage` |
| `somnia.ui.notify(text)` | `ui.notify` |

Panels cannot register commands or call `editor.applyOperations`. To change the project from a panel, store a request with `storage` and handle it in a command, or keep the panel informational. Details of each method are in the [API reference](04-api-reference.md).

## Refreshing

A panel does not receive change events in `apiVersion` 1. Re-read on user action (a button) or on an interval you control. Keep intervals long; reading is cheap but runs the permission check each time.

## Accessibility

- Give the panel a meaningful `title`; it is the accessible name of the region.
- Use real buttons and labels, keep visible focus, and do not rely on color alone. Somnia's themes are not applied inside the iframe, so choose readable contrast in light and dark.

Next: [Lifecycle](06-lifecycle.md).
