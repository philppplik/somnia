import {test,expect} from './fixtures';

/**
 * v2 dev fixture host end-to-end (slice 2): REAL transport/host/event chain in the
 * browser - supervisor + broker + appStore-backed services + module worker + guest SDK.
 * Dev-gated (localStorage flag); requires a FRESH vite server (restarted after edits,
 * cache cleared) so the store module is a single instance.
 */
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{try{localStorage.setItem('somnia.extensions.v2dev','1');}catch{/* storage unavailable */}});
});

test('v2 dev host: command roundtrip, live events, revocation and disposal', async({page})=>{
 const consoleErrors:string[]=[];
 page.on('pageerror',e=>consoleErrors.push(String(e)));
 await page.goto('/');
 // Dev host handle appears once the fixture is installed and enabled (dormant).
 await page.waitForFunction(()=>(window as unknown as {__somnia?:{v2dev?:unknown}}).__somnia?.v2dev,undefined,{timeout:20000});
 const state0=await page.evaluate(()=>{const h=(window as never as {__somnia:{v2dev:{host:{supervisor:{state(id:string):string|undefined}}};extensionId:string}}).__somnia.v2dev;return h.host.supervisor.state(h.extensionId);});
 expect(state0).toBe('dormant');

 // 1) Command roundtrip through the real worker transport (lazy activation on command).
 const result=await page.evaluate(async()=>{
  const h=(window as never as {__somnia:{v2dev:{host:{supervisor:{runCommand(id:string,cmd:string):Promise<unknown>;state(id:string):string|undefined}};extensionId:string}}}).__somnia.v2dev;
  const r=await h.host.supervisor.runCommand(h.extensionId,'acme.word-count.count');
  return {result:r,state:h.host.supervisor.state(h.extensionId)};
 });
 expect(result.result).toBeNull();
 expect(result.state).toBe('active');
 await expect(page.getByText(/Word count: \d+ words in \d+ file\(s\)\./)).toBeVisible();
 await page.screenshot({path:'/downloads/v2-dev-1-command.png'});

 // 2) Live event: a real store write reaches the guest as project.onDidChange.
 await page.evaluate(()=>{(window as never as {__somnia:{setSource(f:string,t:string):void}}).__somnia.setSource('index.html','<!doctype html><html><body><p>changed by v2 e2e</p></body></html>');});
 await expect(page.getByText(/v2 live event: \d+ file\(s\) changed\./)).toBeVisible();
 await page.screenshot({path:'/downloads/v2-dev-2-event.png'});

 // 3) Revocation: disable revokes capabilities before terminating; commands and events stop.
 const afterDisable=await page.evaluate(async()=>{
  const w=window as never as {__somnia:{v2dev:{host:{supervisor:{disable(id:string):void;runCommand(id:string,cmd:string):Promise<unknown>;state(id:string):string|undefined}};extensionId:string};patch(p:{notice:string}):void;setSource(f:string,t:string):void}};
  const h=w.__somnia.v2dev;
  h.host.supervisor.disable(h.extensionId);
  let commandError='';
  try{await h.host.supervisor.runCommand(h.extensionId,'acme.word-count.count');}catch(e){commandError=(e as Error).message;}
  w.__somnia.patch({notice:'marker-after-disable'});
  w.__somnia.setSource('index.html','<!doctype html><html><body><p>changed after disable</p></body></html>');
  return {commandError,state:h.host.supervisor.state(h.extensionId)};
 });
 expect(afterDisable.state).toBe('disabled');
 expect(afterDisable.commandError).toBe('Extension is not active.');
 // No live event may arrive after revocation: the marker notice stays untouched.
 await page.waitForTimeout(500);
 await expect(page.getByText('marker-after-disable')).toBeVisible();
 await expect(page.getByText(/v2 live event/)).toHaveCount(0);

 // 4) Disposal: host teardown leaves the session disabled and inert.
 const afterDispose=await page.evaluate(async()=>{
  const h=(window as never as {__somnia:{v2dev:{host:{supervisor:{runCommand(id:string,cmd:string):Promise<unknown>;state(id:string):string|undefined}};extensionId:string;dispose():void}}}).__somnia.v2dev;
  h.dispose();
  let commandError='';
  try{await h.host.supervisor.runCommand(h.extensionId,'acme.word-count.count');}catch(e){commandError=(e as Error).message;}
  return {commandError,state:h.host.supervisor.state(h.extensionId)};
 });
 expect(afterDispose.state).toBe('disabled');
 expect(afterDispose.commandError).toBe('Extension is not active.');
 await page.screenshot({path:'/downloads/v2-dev-3-disposed.png'});

 expect(consoleErrors.filter(e=>!/favicon|DevTools/.test(e))).toEqual([]);
});

test('dev gate stays closed without the flag', async({page})=>{
 // The beforeEach flag script runs first; this one removes it again before app scripts run.
 await page.addInitScript(()=>{try{localStorage.removeItem('somnia.extensions.v2dev');}catch{/* storage unavailable */}});
 await page.goto('/');
 await page.waitForFunction(()=>!!(window as unknown as {__somnia?:unknown}).__somnia,undefined,{timeout:20000});
 await page.waitForTimeout(3000);
 const has=await page.evaluate(()=>!!(window as unknown as {__somnia?:{v2dev?:unknown}}).__somnia?.v2dev);
 expect(has).toBe(false);
});
