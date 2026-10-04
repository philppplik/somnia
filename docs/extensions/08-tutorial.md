# 8. Tutorial: from Hello World to Word count

Each step is a complete `somnia-extension.json`. Install it with Settings > Extensions > Add from a .json file (or paste it into the text box and press Install), switch it on, then press Ctrl+K.

## Step 1: Hello World

```json
{
  "id": "tutorial.hello",
  "name": "Hello",
  "version": "1.0.0",
  "apiVersion": 1,
  "permissions": ["commands", "ui.notify"],
  "contributes": {
    "commands": [{"id": "tutorial.hello.say", "title": "Say hello", "category": "Tools"}]
  },
  "code": "await somnia.commands.register('tutorial.hello.say', async () => { await somnia.ui.notify('Hello from my extension'); });"
}
```

Run "Say hello (Hello)". The status bar shows the notice. Why it works: the command is declared, the permission `commands` allows registering it, `ui.notify` allows the notice.

## Step 2: A snippet and a theme, no code

```json
{
  "id": "tutorial.style",
  "name": "Style pack",
  "version": "1.0.0",
  "apiVersion": 1,
  "permissions": [],
  "contributes": {
    "snippets": [{"language": "html", "label": "Hero", "body": "<section class=\"hero\"><h1>Title</h1></section>"}],
    "codeThemes": [{"id": "warm", "label": "Warm", "light": {"--syntax-tag": "#9a3412"}, "dark": {"--syntax-tag": "#fdba74"}}]
  }
}
```

Select a container in the layers panel and run "Snippet: Hero (Style pack)". Pick the theme in Settings > Code editor > Syntax theme.

## Step 3: Read the project (Word count)

Install `phase1/examples/word-count/somnia-extension.json`. The core of it:

```js
await somnia.commands.register('somnia.word-count.run', async () => {
  const files = await somnia.project.listFiles();
  const name = files.includes('index.html') ? 'index.html' : files[0];
  const src = await somnia.project.readFile(name);
  const text = src.replace(/<[^>]+>/g, ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  await somnia.ui.notify(name + ': ' + words + ' words');
});
```

It needs `commands`, `project.read` and `ui.notify`. Try unchecking `project.read` in Settings > Extensions and run the command again: it fails with the permission message. That is the permission model working.

## Step 4: Change the project (Safe links)

Install `phase1/examples/safe-links/somnia-extension.json`. Select a link in the design view and run "Make selected link open in a new tab safely". It reads the selection and applies two `setAttribute` operations in one undoable step:

```js
const sel = await somnia.selection.get();
if (!sel || sel.tag !== 'a') { await somnia.ui.notify('Select a link (a) first.'); return; }
await somnia.editor.applyOperations([
  { type: 'setAttribute', file: 'index.html', nodeId: sel.id, name: 'target', value: '_blank' },
  { type: 'setAttribute', file: 'index.html', nodeId: sel.id, name: 'rel', value: 'noopener noreferrer' }
]);
```

Press Ctrl+Z to undo it.

## Step 5: A panel

```json
{
  "id": "tutorial.files",
  "name": "File list",
  "version": "1.0.0",
  "apiVersion": 1,
  "permissions": ["project.read"],
  "contributes": {
    "panels": [{
      "id": "list", "title": "Project files", "side": "right",
      "html": "<ul id='l'></ul><button id='b'>Refresh</button><script>const r=()=>somnia.project.listFiles().then(f=>{l.innerHTML=f.map(x=>'<li>'+x+'</li>').join('')});b.onclick=r;r();</script>"
    }]
  }
}
```

A new icon appears in the right rail. The panel reads the file list through the sandbox bridge. Remember that panels are read-only and cannot reach the network ([Panels](05-panels.md)).

## Where to go next

[API reference](04-api-reference.md), [Packaging and install](09-packaging-install.md), [Troubleshooting](10-troubleshooting.md).
