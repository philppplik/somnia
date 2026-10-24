// Usage (from phase1/): npm run agent:harness [-- --shots name1,name2]
// Starts the control build, runs a smoke loop (inspect, run a command, screenshot) and prints a JSON report.
import { startServer, openApp } from './harness.mjs';

const server = await startServer();
let app;
let failed = false;
try {
  app = await openApp({ url: server.url });
  const { ctl } = app;
  const before = await ctl.inspect();
  const cmds = await ctl.listCommands();
  const legacyId = 'problems.toggle';
  const bad = await ctl.runCommand('does.notExist');
  const run = legacyId ? await ctl.runCommand(legacyId) : null;
  const after = await ctl.inspect();
  const shot = await ctl.screenshot('smoke');
  const report = { before: { studio: before.activeStudio, file: before.activeFile, openFiles: before.openFiles, panels: before.panels }, specCommands: cmds.length, unknownCommand: bad, ran: legacyId, runResult: run, after: { panels: after.panels }, screenshot: shot, pageErrors: app.errors };
  console.log(JSON.stringify(report, null, 2));
  if (bad.ok !== false || bad.code !== 'unknown-command' || app.errors.length) failed = true;
} catch (e) { console.error(e); failed = true; }
finally { await app?.close(); server.stop(); }
process.exit(failed ? 1 : 0);
