# hello-panel

The smallest executable SDK v2 extension: one command, one declarative panel.

- **Contributions:** command `acme.hello-panel.say-hello`, right-rail panel `hello`
- **Permissions:** `commands`, `ui.notify`
- **Teaches:** manifest anatomy, activation events (`onCommand:`, `onPanel:`), the
  declarative view tree, the validate/pack loop

Run from `phase1`:

```
npx tsx scripts/somnia-ext-v2.ts validate ../docs/extensions/v2/examples/hello-panel
npx tsx scripts/somnia-ext-v2.ts pack ../docs/extensions/v2/examples/hello-panel
```

Backs the [Quickstart](../quickstart.md). Declarative panels need no scripts and
no network; the view tree supports `text`, `button`, `input`, `select`, `list`
and `group`, at most 8 levels deep.
