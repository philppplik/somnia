import {test as base,expect,type Page,type BrowserContext} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {open} from './collabHelpers';
/**
 * Collab Office guest-open E2E for documents (CO4): two real windows against the real
 * somnia-relay binary. Host opens a DOCX and shares; the guest opens the same bytes, adopts
 * the shared op journal and both edit through it. Same skip rule as collab-relay.spec.ts.
 */
const BIN=process.env.SOMNIA_RELAY_BIN??'../relay/target/release/somnia-relay';
const release=JSON.parse(readFileSync('./package.json','utf8')).somniaRelease as string;
const FIXTURE=readFileSync('test/documents/sample.docx');
const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const freePort=()=>new Promise<number>((res,rej)=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=(s.address() as {port:number}).port;s.close(()=>res(p));});s.on('error',rej);});
let relay:ChildProcess|null=null;let port=0;
async function startRelay(p:number){
 relay=spawn(BIN,['--bind',`127.0.0.1:${p}`],{stdio:'ignore'});
 for(let i=0;i<100;i++){try{const r=await fetch(`http://127.0.0.1:${p}/healthz`);if(r.ok)return;}catch{/* not up yet */}await new Promise(r=>setTimeout(r,50));}
 throw new Error('relay did not start');}
const stopRelay=async()=>{const r=relay;relay=null;if(!r)return;r.kill('SIGKILL');await new Promise(res=>r.once('exit',res));};
const test=base.extend<{host:Page;guest:Page}>({
 host:async({browser},use)=>{const c=await browser.newContext({baseURL:'http://127.0.0.1:1420',viewport:{width:1440,height:900}});await prep(c,true);const p=await c.newPage();await use(p);await c.close();},
 guest:async({browser},use)=>{const c=await browser.newContext({baseURL:'http://127.0.0.1:1420',viewport:{width:1440,height:900}});await prep(c,false);const p=await c.newPage();await use(p);await c.close();},
});
async function prep(c:BrowserContext,sample:boolean){
 await c.addInitScript(([r,s])=>{localStorage.setItem('somnia.welcome.seen.v1',r as string);if(s)localStorage.setItem('somnia.fixture','starter');else localStorage.removeItem('somnia.fixture');},[release,sample] as const);}
test.skip(!existsSync(BIN),`relay binary not found at ${BIN}: build it with cargo build --release --manifest-path ../relay/Cargo.toml`);
test.describe.configure({mode:'serial'});
test.beforeAll(async()=>{port=await freePort();await startRelay(port);});
test.afterAll(async()=>{await stopRelay();});
async function openDocx(page:Page){const chooser=page.waitForEvent('filechooser');await page.evaluate(async()=>{const m=await import('/src/lib/commands.ts');void m.executeCommand('project.openMedia');});(await chooser).setFiles([{name:'sample.docx',mimeType:DOCX,buffer:FIXTURE}]);await expect(page.getByTestId('documents-pages')).toHaveText('1 pages',{timeout:30000});}
const firstPara=(p:Page)=>p.getByTestId('documents-editor').getByRole('textbox').first();
test('guest opens the shared document: adopt, live text edits both ways, presence, per-person undo',async({host,guest})=>{
 await host.goto('/');await guest.goto('/');
 await openDocx(host);
 const original=await firstPara(host).inputValue();
 // host shares
 await open(host,'Share project...');
 await host.getByLabel('Relay address').fill(`ws://127.0.0.1:${port}`);
 await host.getByRole('button',{name:'Start sharing'}).click();
 await expect(host.getByTestId('conn-label')).toHaveText(/^Connected · Relay/);
 await host.getByRole('button',{name:'Show link'}).click();
 const link=await host.getByLabel('Link for others link').inputValue();
 await host.getByRole('button',{name:'Close',exact:true}).click();
 // guest joins
 await open(guest,'Join shared project...');
 await guest.getByLabel('Invite link').fill(link);await guest.getByLabel('Your name').fill('Gabi');
 await guest.getByRole('button',{name:'Join',exact:true}).click();
 await expect(guest.getByTestId('guest-connected')).toBeVisible();
 await guest.getByRole('button',{name:'Close',exact:true}).click();
 // guest opens the same bytes and adopts the journal
 await openDocx(guest);
 await expect(firstPara(guest)).toHaveValue(original);
 // guest edit replicates to the host
 await firstPara(guest).fill('Von Gabi');await firstPara(guest).blur();
 await expect(firstPara(host)).toHaveValue('Von Gabi',{timeout:20000});
 // per-person undo: the guest reverts only their own edit
 await guest.getByTestId('documents-undo').click();
 await expect(firstPara(guest)).toHaveValue(original,{timeout:20000});
 await expect(firstPara(host)).toHaveValue(original);
 // host edit replicates back
 await firstPara(host).fill('Vom Host');await firstPara(host).blur();
 await expect(firstPara(guest)).toHaveValue('Vom Host',{timeout:20000});
 // presence: the host sees the guest's caret chip
 await expect(host.getByTestId('documents-peer')).toContainText('Gabi',{timeout:15000});
 await host.screenshot({path:'test-results/collab-docs-host.png'});
 await guest.screenshot({path:'test-results/collab-docs-guest.png'});
});
