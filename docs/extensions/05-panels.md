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

- In the desktop app each panel is served as its own document at `somnia-ext://panel/<extension id>/<panel id>` and shown in an iframe with `sandbox="allow-scripts"` (opaque origin, no top navigation, no popups). Web builds use `srcdoc` with the same document.
- The document carries the Content-Security-Policy `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'` (an HTTP header natively, a meta tag in web builds). Inline scripts and styles work. External scripts, fonts, images, `fetch`, form posts and `<base>` do not. Use `data:` URLs for images.
- A CSP cannot stop a page from navigating its own frame (`location.href`, links, meta refresh). Somnia handles that outside the CSP: the app only allows its own panel scheme as a frame source, API calls only work over a per-session channel that dies with the first document, and a panel that loads a second document is removed. See 07-security.md.
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
