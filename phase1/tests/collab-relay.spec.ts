import {test as base,expect,type Page,type BrowserContext} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {open} from './collabHelpers';
import {showCode} from './helpers';
/**
 * Two real app windows against the real somnia-relay binary (relay/, Rust). Build it first:
 *   cargo build --release --manifest-path ../relay/Cargo.toml     (or set SOMNIA_RELAY_BIN)
 * Without the binary these tests are skipped with that reason shown.
 */
const BIN=process.env.SOMNIA_RELAY_BIN??'../relay/target/release/somnia-relay';
const release=JSON.parse(readFileSync('./package.json','utf8')).somniaRelease as string;
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
const pill=(p:Page)=>p.getByTestId('collab-status');
const editor=(p:Page)=>p.getByLabel('Source code');
test('two windows: share, join, live text, cursors, labels, leave',async({host,guest})=>{
 await host.goto('/');await guest.goto('/');
 // host
 await open(host,'Share project...');
 await host.getByLabel('Relay address').fill(`ws://127.0.0.1:${port}`);
 await host.getByRole('button',{name:'Start sharing'}).click();
 await expect(host.getByTestId('conn-label')).toHaveText(/^Connected \u00b7 Relay/);
 await expect(host.getByTestId('e2e-note')).toContainText('Key fingerprint');
 await expect(host.getByTestId('alone-note')).toBeVisible();
 const link0=host.getByLabel('Link for others link');
 await expect(link0).not.toHaveValue(/#key=[A-Za-z0-9_-]{9,}/);await expect(link0).not.toHaveValue(/room\/[A-Za-z0-9_-]{9,}/);
 await host.getByRole('button',{name:'Show link'}).click();
 const link=await link0.inputValue();expect(link).toMatch(new RegExp(`^ws://127\\.0\\.0\\.1:${port}/room/m1_\\d{10}_[a-f0-9]{64}#key=[A-Za-z0-9_-]{43}&m=relay$`));
 const fp=(await host.getByTestId('e2e-note').textContent())!.match(/fingerprint: ([0-9a-f]{8})/)![1];
 await host.screenshot({path:'test-results/collab-host-dialog.png'});
 await host.getByRole('button',{name:'Close',exact:true}).click();
 await expect(pill(host)).toHaveText(/Connected \u00b7 Relay/);
 // guest
 await open(guest,'Join shared project...');
 await guest.getByLabel('Invite link').fill(link);await guest.getByLabel('Your name').fill('Gabi');
 await guest.getByRole('button',{name:'Join',exact:true}).click();
 await expect(guest.getByTestId('guest-connected')).toBeVisible();
 await expect(guest.getByTestId('e2e-note')).toContainText(fp);
 await expect(guest.getByTestId('participant')).toHaveCount(2,{timeout:15000});
 await expect(guest.getByTestId('participants')).toContainText('Gabi');
 await expect(pill(guest)).toHaveText(/Connected \u00b7 Relay \u00b7 2 people/);
 await guest.screenshot({path:'test-results/collab-guest-dialog.png'});
 await guest.getByRole('button',{name:'Close',exact:true}).click();
 await expect(pill(host)).toHaveText(/Connected \u00b7 Relay \u00b7 2 people/,{timeout:15000});
 // guest adopted the host project
 await showCode(guest);await showCode(host);
 await expect(editor(guest)).toContainText('Somnia studio');
 // live text both ways
 await editor(host).click();await host.keyboard.press('Control+End');await host.keyboard.type('<!-- from-host -->');
 await expect(editor(guest)).toContainText('from-host',{timeout:10000});
 await editor(guest).click();await guest.keyboard.press('Control+End');await guest.keyboard.type('<!-- from-guest -->');
 await expect(editor(host)).toContainText('from-guest',{timeout:10000});
 // remote cursor with the other person's name
 await expect(host.locator('.cm-ySelectionInfo',{hasText:'Gabi'}).first()).toBeAttached({timeout:10000});
 await expect(guest.locator('.cm-ySelectionInfo').first()).toBeAttached({timeout:10000});
 await host.screenshot({path:'test-results/collab-host.png'});await guest.screenshot({path:'test-results/collab-guest.png'});
 // guest leaves: host sees one person again
 await open(guest,'Join shared project...');await guest.getByRole('button',{name:'Leave session'}).click();
 await expect(guest.getByTestId('collab-status')).toHaveCount(0);
 await expect(pill(host)).toHaveText(/Connected \u00b7 Relay \u00b7 1 person/,{timeout:10000});
});
test('relay restart: both sides show reconnecting, then resync and keep editing',async({host,guest})=>{
 await host.goto('/');await guest.goto('/');
 await open(host,'Share project...');await host.getByLabel('Relay address').fill(`ws://127.0.0.1:${port}`);await host.getByRole('button',{name:'Start sharing'}).click();
 await expect(host.getByTestId('conn-label')).toHaveText(/^Connected \u00b7 Relay/);
 await host.getByRole('button',{name:'Show link'}).click();const link=await host.getByLabel('Link for others link').inputValue();
 await host.getByRole('button',{name:'Close',exact:true}).click();
 await open(guest,'Join shared project...');await guest.getByLabel('Invite link').fill(link);await guest.getByRole('button',{name:'Join',exact:true}).click();
 await expect(guest.getByTestId('participant')).toHaveCount(2,{timeout:15000});await guest.getByRole('button',{name:'Close',exact:true}).click();
 await showCode(host);await showCode(guest);
 await stopRelay();
 await expect(pill(host)).toHaveText(/Reconnecting/,{timeout:15000});await expect(pill(guest)).toHaveText(/Reconnecting/,{timeout:15000});
 // typing while offline is queued, not lost
 await editor(host).click();await host.keyboard.press('Control+End');await host.keyboard.type('<!-- offline-edit -->');
 await startRelay(port);
 await expect(pill(host)).toHaveText(/^Connected/,{timeout:30000});await expect(pill(guest)).toHaveText(/^Connected/,{timeout:30000});
 await expect(editor(guest)).toContainText('offline-edit',{timeout:20000});
});

test('host ends room: guest is disconnected and the old invite cannot rejoin',async({host,guest})=>{
 await host.goto('/');await guest.goto('/');await open(host,'Share project...');
 await expect(host.getByLabel('Session lifetime')).toHaveValue('60');
 await host.getByLabel('Relay address').fill(`ws://127.0.0.1:${port}`);await host.getByRole('button',{name:'Start sharing'}).click();
 await expect(host.getByTestId('conn-label')).toHaveText(/^Connected/);await expect(host.getByTestId('session-expiry')).toBeVisible();
 await host.getByRole('button',{name:'Show link'}).click();const link=await host.getByLabel('Link for others link').inputValue();expect(link).not.toContain('host=');
 await open(guest,'Join shared project...');await guest.getByLabel('Invite link').fill(link);await guest.getByRole('button',{name:'Join',exact:true}).click();await expect(guest.getByTestId('participant')).toHaveCount(2);
 await host.getByRole('button',{name:'End session and invalidate link'}).click();await expect(guest.getByTestId('session-error')).toBeVisible({timeout:10000});
 await guest.screenshot({path:'test-results/collab-revoked-dialog.png'});
 await guest.getByRole('button',{name:'Leave session'}).click();await guest.getByLabel('Invite link').fill(link);await guest.getByRole('button',{name:'Join',exact:true}).click();
 await expect(guest.getByTestId('join-error')).toBeVisible({timeout:60000});
});
