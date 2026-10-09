// TEST FIXTURE ONLY. Not installed or exposed in the application/catalog.
export async function activate(somnia) {
  await somnia.commands.register('poc.module.inspect', async () => {
    const files = await somnia.project.listFiles();
    const text = await somnia.project.readFile(files[0]);
    await somnia.ui.notify(`Read ${text.length} characters`);
  });
  await somnia.commands.register('poc.module.denied', async () => {
    await somnia.selection.get();
  });
  await somnia.commands.register('poc.module.csp', async () => {
    let evalBlocked = false, fetchBlocked = false, importBlocked = false;
    try {Function('return 1')();} catch {evalBlocked = true;}
    // Same-origin network and script loads must also be blocked by worker CSP.
    try {await fetch('/leak');} catch {fetchBlocked = true;}
    try {await import('/leak.js');} catch {importBlocked = true;}
    if (!evalBlocked || !fetchBlocked || !importBlocked) throw new Error('Worker CSP failed');
    await somnia.ui.notify('Worker CSP blocked eval, fetch, and unlisted import');
  });
  await somnia.commands.register('poc.module.hang', () => new Promise(() => {}));
}
