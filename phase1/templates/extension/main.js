// Runs in the extension worker. Only the `somnia` API is available.
await somnia.commands.register('__ID__.hello', async () => {
  await somnia.ui.notify('Hello from __NAME__');
});
