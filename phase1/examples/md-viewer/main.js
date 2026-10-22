// Reads the exact file the user picked via the single-open token and reports a tiny summary.
somnia.commands.register('somnia.md-viewer.open', async args => {
  const f = await somnia.project.readOfferFile(args.token);
  const text = new TextDecoder().decode(f.bytes);
  const headings = text.split('\n').filter(l => l.startsWith('#')).length;
  await somnia.ui.notify(`MD Viewer: ${f.name} - ${text.length} chars, ${headings} headings`);
});
