import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../../',import.meta.url));
const {outputFiles} = await build({entryPoints:[root+'src/lib/extensions/v2/moduleRuntime.ts'],bundle:true,format:'esm',write:false});
let leakRequests = 0;
let origin;
const server = createServer(async (req,res) => {
  if (req.url.startsWith('/leak')) {leakRequests++; res.end('export const leaked=true'); return;}
  if (req.url === '/broker.js') {res.setHeader('Content-Type','text/javascript');res.end(outputFiles[0].text);return;}
  if (req.url === '/worker.js' || req.url === '/extension.js') {
    res.setHeader('Content-Type','text/javascript');
    res.setHeader('Content-Security-Policy',`default-src 'none'; script-src ${origin}/worker.js ${origin}/extension.js; connect-src 'none'; worker-src 'none'; object-src 'none'`);
    res.end(await readFile(root+'public/poc/extension-v2'+req.url));return;
  }
  if (req.url === '/never.js') {res.setHeader('Content-Type','text/javascript');res.end('self.onmessage=()=>{}');return;}
  if (req.url === '/broken.js') {res.setHeader('Content-Type','text/javascript');res.end('this is invalid syntax');return;}
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'");
  res.end('<!doctype html><title>Extension v2 CSP test</title>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH ?? '/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
try {
  const page = await browser.newPage(); await page.goto(origin);
  const results = await page.evaluate(async () => {
    const {ModuleRuntime} = await import('/broker.js');
    const notes=[];
    const ids=['inspect','denied','csp','hang'].map(s=>`poc.module.${s}`);
    const manifest={id:'poc.module',name:'PoC',version:'0.0.0',apiVersion:2,permissions:['commands','project.read','ui.notify'],contributes:{commands:ids.map(id=>({id,title:id,category:'Tools'})),snippets:[],panels:[],codeThemes:[]}};
    const deps={files:()=>({'index.html':'<h1>hi</h1>'}),selection:()=>({id:'private',tag:'p'}),notify:text=>notes.push(text)};
    const errors=[];
    const expectError=async fn=>{try {await fn(); throw Error('Expected rejection');} catch(e) {errors.push(e.message);}};
    const runtime=new ModuleRuntime(manifest,new URL('/worker.js',location.href),deps,1500);
    await runtime.runCommand(ids[0]); // Deliberately before ready: handshake must queue.
    await expectError(()=>runtime.runCommand(ids[1]));
    await runtime.runCommand(ids[2]);
    await expectError(()=>runtime.runCommand('foreign.command'));
    await expectError(()=>runtime.runCommand(ids[3]));
    await expectError(()=>runtime.runCommand(ids[0]));
    runtime.dispose();
    const pending=new ModuleRuntime(manifest,new URL('/never.js',location.href),deps,100);
    await expectError(()=>pending.runCommand(ids[0])); pending.dispose();
    const broken=new ModuleRuntime(manifest,new URL('/broken.js',location.href),deps,1500);
    await expectError(()=>broken.runCommand(ids[0])); broken.dispose();
    const disposed=new ModuleRuntime(manifest,new URL('/never.js',location.href),deps,1500);
    const run=disposed.runCommand(ids[0]); disposed.dispose(); await expectError(()=>run);
    try {new ModuleRuntime(manifest,new URL('blob:https://example.invalid/id'),deps);} catch(e) {errors.push(e.message);}
    return {notes,errors};
  });
  assert.deepEqual(results.notes,['Read 11 characters','Worker CSP blocked eval, fetch, and unlisted import']);
  assert.match(results.errors[0],/selection.*permission/);
  assert.match(results.errors[1],/Undeclared command/);
  assert.match(results.errors[2],/command timed out/);
  assert.match(results.errors[3],/closed/);
  assert.match(results.errors[4],/activation timed out/);
  assert.match(results.errors[5],/worker failed/);
  assert.match(results.errors[6],/disposed/);
  assert.match(results.errors[7],/asset scheme/);
  assert.equal(leakRequests,0);
  console.log(JSON.stringify({status:'passed',...results,leakRequests},null,2));
} finally {await browser.close();server.close();}
