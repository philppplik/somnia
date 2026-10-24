import {test as base,expect,type Page,type BrowserContext} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {open} from './collabHelpers';
/**
 * Collab Office guest-open E2E for decks (CO3): two real windows against the real somnia-relay
 * binary. Host opens a PPTX and shares; the guest receives the bytes, adopts the shared op
 * journal and both edit through it. Same skip rule as collab-relay.spec.ts.
 */
const BIN=process.env.SOMNIA_RELAY_BIN??'../relay/target/release/somnia-relay';
const release=JSON.parse(readFileSync('./package.json','utf8')).somniaRelease as string;
const FIXTURE=readFileSync('slides-engine/fixtures/independent.pptx');
const PPTX='application/vnd.openxmlformats-officedocument.presentationml.presentation';
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
async function openDeck(page:Page){const input=page.getByLabel('Open PPTX',{exact:true});await page.getByRole('radio',{name:'Slides',exact:true}).click();await input.setInputFiles({name:'deck.pptx',mimeType:PPTX,buffer:FIXTURE});await expect(page.getByAltText('Slide 1',{exact:true})).toBeVisible({timeout:30000});}
test('guest opens the shared deck: adopt, live text edits both ways, presence, per-person undo',async({host,guest})=>{
 await host.goto('/');await guest.goto('/');
 await openDeck(host);
 await expect(host.getByRole('textbox',{name:'Text run 1',exact:true})).toHaveValue('Somnia Documents Studio');
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
 // guest receives the deck and adopts the journal
 await openDeck(guest);
 await expect(guest.getByRole('textbox',{name:'Text run 1',exact:true})).toHaveValue('Somnia Documents Studio');
 // guest edit replicates to the host
 await guest.getByRole('textbox',{name:'Text run 1',exact:true}).fill('Von Gabi');
 await expect(host.getByRole('textbox',{name:'Text run 1',exact:true})).toHaveValue('Von Gabi',{timeout:20000});
 // per-person undo: the guest reverts only their own text edit
 await guest.getByRole('button',{name:'Undo text'}).click();
 await expect(guest.getByRole('textbox',{name:'Text run 1',exact:true})).toHaveValue('Somnia Documents Studio',{timeout:20000});
 await expect(host.getByRole('textbox',{name:'Text run 1',exact:true})).toHaveValue('Somnia Documents Studio');
 // host edit replicates back
 await host.getByRole('textbox',{name:'Text run 1',exact:true}).fill('Vom Host');
 await expect(guest.getByRole('textbox',{name:'Text run 1',exact:true})).toHaveValue('Vom Host',{timeout:20000});
 // presence: each sees the other's slide chip in the footer
 await expect(host.getByTestId('slides-peer')).toContainText('Gabi',{timeout:15000});
 await host.screenshot({path:'test-results/collab-slides-host.png'});
 await guest.screenshot({path:'test-results/collab-slides-guest.png'});
});
