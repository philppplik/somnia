import type {SomniaV2} from './api';

/**
 * Bundled guest module of the acme.word-count dev fixture (contracts/v2/example.json).
 * Loaded only through the DEV-gated v2 fixture host (v2/devHost.ts) inside the app
 * bundle; it is never installed through a catalog, package download or local install
 * path. Exercises the real v2 chain: lazy activation on command, command roundtrip,
 * project.read calls, live project.onDidChange events and ui.notify. The v2 write path
 * stays locked host-side, so this guest intentionally performs no edits.
 */
export async function activate(somnia:SomniaV2):Promise<void> {
 await somnia.commands.register('acme.word-count.count',async()=>{
  const files=await somnia.project.listFiles();
  let words=0;
  for(const file of files){
   const {text}=await somnia.project.readFile(file.path);
   words+=text.split(/\s+/).filter(Boolean).length;
  }
  await somnia.ui.notify(`Word count: ${words} words in ${files.length} file(s).`);
  return null;
 });
 await somnia.project.onDidChange(async event=>{
  await somnia.ui.notify(`v2 live event: ${event.paths.length} file(s) changed.`);
 });
}
