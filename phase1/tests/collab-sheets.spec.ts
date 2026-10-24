import {test as base,expect,type Page,type BrowserContext} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {open} from './collabHelpers';
/**
 * Collab Office guest-open E2E (CO2): two real windows against the real somnia-relay binary.
 * Host opens an xlsx, shares; the guest receives the bytes, adopts the shared model and both
 * edit through it. Same skip rule as collab-relay.spec.ts:
 *   cargo build --release --manifest-path ../relay/Cargo.toml     (or set SOMNIA_RELAY_BIN)
 */
const BIN=process.env.SOMNIA_RELAY_BIN??'../relay/target/release/somnia-relay';
const release=JSON.parse(readFileSync('./package.json','utf8')).somniaRelease as string;
const XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FIXTURE=readFileSync(new URL('../sheets-craft/fixtures/fixture.xlsx',import.meta.url));
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
const cell=(p:Page,a:string)=>p.locator(`[data-address="${a}"]`);
async function openXlsx(page:Page,name:string,buffer:Buffer){const chooser=page.waitForEvent('filechooser');await page.evaluate(async()=>{const m=await import('/src/lib/commands.ts');void m.executeCommand('project.openMedia');});(await chooser).setFiles([{name,mimeType:XLSX,buffer}]);}
test('guest opens the shared workbook: seed, live edits both ways, presence, per-person undo',async({host,guest})=>{
 await host.goto('/');await guest.goto('/');
 await openXlsx(host,'sales.xlsx',FIXTURE);
 await host.getByRole('radio',{name:'Somnia Sheets'}).click();
 await expect(cell(host,'A2')).toHaveText('Coffee');
 // host shares
 await open(host,'Share project...');
 await host.getByLabel('Relay address').fill(`ws://127.0.0.1:${port}`);
 await host.getByRole('button',{name:'Start sharing'}).click();
 await expect(host.getByTestId('conn-label')).toHaveText(/^Connected \u00b7 Relay/);
 await host.getByRole('button',{name:'Show link'}).click();
 const link=await host.getByLabel('Link for others link').inputValue();
 await host.getByRole('button',{name:'Close',exact:true}).click();
 // guest joins
 await open(guest,'Join shared project...');
 await guest.getByLabel('Invite link').fill(link);await guest.getByLabel('Your name').fill('Gabi');
 await guest.getByRole('button',{name:'Join',exact:true}).click();
 await expect(guest.getByTestId('guest-connected')).toBeVisible();
 await guest.getByRole('button',{name:'Close',exact:true}).click();
 // guest receives the workbook bytes and adopts the shared model
 await expect(guest.getByRole('tab',{name:'sales.xlsx'})).toBeVisible({timeout:30000});
 await guest.getByRole('tab',{name:'sales.xlsx'}).click();
 await guest.getByRole('radio',{name:'Somnia Sheets'}).click();
 await expect(cell(guest,'A2')).toHaveText('Coffee',{timeout:15000});
 await expect(cell(guest,'C2')).toHaveText('20');
 await host.screenshot({path:'test-results/collab-sheets-host.png'});
 await guest.screenshot({path:'test-results/collab-sheets-guest.png'});
 // guest edit replicates to the host and recalculates there
 await cell(guest,'B2').click();await guest.keyboard.type('9');await guest.keyboard.press('Enter');
 await expect(cell(host,'B2')).toHaveText('9',{timeout:15000});
 await expect(cell(host,'C2')).toHaveText('90');
 // host edit replicates back
 await cell(host,'A3').click();await host.keyboard.type('Tea');await host.keyboard.press('Enter');
 await expect(cell(guest,'A3')).toHaveText('Tea',{timeout:15000});
 // presence: the host sees the guest's selection chip
 await cell(guest,'A1').click();
 await expect(host.getByText('Gabi').first()).toBeVisible({timeout:15000});
 // per-person undo: the guest undoes only their own edit; the host's stays
 await guest.getByRole('region',{name:/^Workbook/}).getByRole('button',{name:'Undo'}).click();
 await expect(cell(guest,'B2')).toHaveText('2',{timeout:15000});
 await expect(cell(host,'B2')).toHaveText('2');
 await expect(cell(guest,'A3')).toHaveText('Tea');
 await guest.screenshot({path:'test-results/collab-sheets-final.png'});
});
