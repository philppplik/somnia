import {test as base,expect,type Page,type BrowserContext} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {open} from './collabHelpers';

/**
 * Two real app windows against the real somnia-relay binary (relay/, Rust). Build it first:
 *   cargo build --release --manifest-path ../relay/Cargo.toml     (or set SOMNIA_RELAY_BIN)
 * Without the binary these tests are skipped with that reason shown.
 */
const BIN=process.env.SOMNIA_RELAY_BIN??'../relay/target/release/somnia-relay';
const release=JSON.parse(readFileSync('./package.json','utf8')).somniaRelease as string;
const PROFILE_KEY='somnia.account.profile.v1';
const PHOTO='data:image/jpeg;base64,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';
const freePort=()=>new Promise<number>((res,rej)=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=(s.address() as {port:number}).port;s.close(()=>res(p));});s.on('error',rej);});
let relay:ChildProcess|null=null;let port=0;
async function startRelay(p:number){
 relay=spawn(BIN,['--bind',`127.0.0.1:${p}`],{stdio:'ignore'});
 for(let i=0;i<100;i++){try{const r=await fetch(`http://127.0.0.1:${p}/healthz`);if(r.ok)return;}catch{/* not up yet */}await new Promise(r=>setTimeout(r,50));}
 throw new Error('relay did not start');}
const test=base.extend<{host:Page;guest:Page}>({
 host:async({browser},use)=>{const c=await mkCtx(browser,true,{nickname:'Hanna Host',avatar:PHOTO});const p=await c.newPage();await use(p);await c.close();},
 guest:async({browser},use)=>{const c=await mkCtx(browser,false,null);const p=await c.newPage();await use(p);await c.close();},
});
async function mkCtx(browser:import('@playwright/test').Browser,sample:boolean,profile:{nickname:string;avatar:string}|null):Promise<BrowserContext>{
 const c=await browser.newContext({baseURL:'http://127.0.0.1:1420',viewport:{width:1440,height:900}});
 await c.addInitScript(([r,s,pk,pv])=>{localStorage.setItem('somnia.welcome.seen.v1',r as string);if(s)localStorage.setItem('somnia.fixture','starter');else localStorage.removeItem('somnia.fixture');if(pv&&!sessionStorage.getItem('seeded')){localStorage.setItem(pk as string,pv as string);sessionStorage.setItem('seeded','1');}},[release,sample,PROFILE_KEY,profile?JSON.stringify(profile):''] as const);
 return c;}
test.skip(!existsSync(BIN),`relay binary not found at ${BIN}`);
test.describe.configure({mode:'serial'});
test.beforeAll(async()=>{port=await freePort();await startRelay(port);});
test.afterAll(async()=>{const r=relay;relay=null;if(r){r.kill('SIGKILL');await new Promise(res=>r.once('exit',res));}});
const profileOf=(p:Page)=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)||'null'),PROFILE_KEY);
async function hostStart(host:Page){
 await host.goto('/');await open(host,'Share project...');
 await host.getByLabel('Relay address').fill(`ws://127.0.0.1:${port}`);
 await host.getByRole('button',{name:'Start sharing'}).click();
 await expect(host.getByTestId('conn-label')).toHaveText(/^Connected/);
 await host.getByRole('button',{name:'Show link'}).click();
 return host.getByLabel('Link for others link').inputValue();}
test('join identity: prefill, empty-profile save after join, avatars in chat and mention picker, light and dark',async({host,guest,browser})=>{
 const link=await hostStart(host);
 await expect(host.getByTestId('participants')).toContainText('Hanna Host');
 await host.getByRole('button',{name:'Close',exact:true}).click();
 // 1) empty profile: empty labelled name, hint, no write on error or cancel, save only after connect
 await guest.goto('/');await open(guest,'Join shared project...');
 const name=guest.getByLabel('Your name');await expect(name).toHaveValue('');
 await expect(guest.getByTestId('identity-hint')).toHaveText('This name will be saved to your local profile after you join.');
 await guest.getByLabel('Invite link').fill(link);
 await guest.getByRole('button',{name:'Join',exact:true}).click();
 await expect(guest.getByTestId('identity-error')).toHaveText('Enter a name for this session.');await expect(guest.getByTestId('guest-connected')).toHaveCount(0);
 await name.fill('<b>x</b>');await expect(guest.getByTestId('identity-error')).toContainText('single-line');
 await name.fill('x'.repeat(33));await expect(guest.getByTestId('identity-error')).toContainText('32 characters');
 await guest.screenshot({path:'test-results/identity-join-error.png'});
 expect(await profileOf(guest)).toBeNull();
 await name.fill('  Gabi  ');
 await guest.getByRole('button',{name:'Join',exact:true}).click();
 await expect(guest.getByTestId('guest-connected')).toBeVisible();await expect(guest.getByTestId('participant')).toHaveCount(2,{timeout:15000});
 await expect.poll(()=>profileOf(guest)).toMatchObject({nickname:'Gabi',avatar:''});
 await expect(guest.getByTestId('name-save-failed')).toHaveCount(0);
 await guest.getByRole('button',{name:'Close',exact:true}).click();
 // 2) chat: the host's picture reaches the guest, the guest (no picture) gets initials
 await guest.keyboard.press('Control+Shift+C');const gp=guest.getByRole('region',{name:'Session chat'});await expect(gp).toBeVisible();
 await host.keyboard.press('Control+Shift+C');const hp=host.getByRole('region',{name:'Session chat'});await expect(hp).toBeVisible();
 await hp.getByLabel('Session message').fill('Hello from the host');await hp.getByLabel('Session message').press('Enter');
 await expect(gp.getByText('Hello from the host')).toBeVisible();
 await expect(gp.locator('.sc-avatar[data-avatar="image"] img').first()).toBeVisible({timeout:10000});
 await expect.poll(()=>gp.locator('.sc-avatar img').first().evaluate((i:HTMLImageElement)=>i.complete&&i.naturalWidth===48)).toBe(true);
 await gp.getByLabel('Session message').fill('Hi @');await expect(gp.getByRole('listbox')).toBeVisible();
 await expect(gp.getByRole('option',{name:/Hanna Host/}).locator('img')).toBeVisible();
 await guest.screenshot({path:'test-results/identity-chat-mention-light.png'});
 await gp.getByLabel('Session message').fill('');
 await guest.evaluate(()=>{document.documentElement.dataset.theme='dark';});await gp.getByLabel('Session message').fill('Hi @');
 await expect.poll(()=>gp.getByRole('option',{name:/Hanna Host/}).locator('img').evaluate((i:HTMLImageElement)=>i.complete&&getComputedStyle(i).opacity==='1')).toBe(true);
 await guest.screenshot({path:'test-results/identity-chat-mention-dark.png'});
 // the guest's profile keeps no picture: nothing was copied from the host
 expect(await profileOf(guest)).toMatchObject({avatar:''});
 // 3) populated profile: prefilled, session-only edit leaves the profile alone
 const c3=await mkCtx(browser,false,{nickname:'Pia Profile',avatar:''});const g3=await c3.newPage();
 await g3.goto('/');await open(g3,'Join shared project...');
 await expect(g3.getByLabel('Your name')).toHaveValue('Pia Profile');await expect(g3.getByTestId('identity-hint')).toHaveText('From your local profile. Change it for this session.');await expect(g3.getByTestId('identity-disclosure')).toHaveText('Your name is visible to people in this session.');
 await g3.getByLabel('Invite link').fill(link);await g3.getByLabel('Your name').fill('Pia (session)');
 await g3.getByRole('button',{name:'Join',exact:true}).click();await expect(g3.getByTestId('participant')).toHaveCount(3,{timeout:15000});
 await expect(g3.getByTestId('participants')).toContainText('Pia (session)');
 expect(await profileOf(g3)).toMatchObject({nickname:'Pia Profile'});
 await c3.close();
 // 4) long profile name is kept, flagged and not truncated
 const c4=await mkCtx(browser,false,{nickname:'L'.repeat(40),avatar:''});const g4=await c4.newPage();
 await g4.goto('/');await open(g4,'Join shared project...');await expect(g4.getByLabel('Your name')).toHaveValue('L'.repeat(40));
 await expect(g4.getByTestId('identity-error')).toContainText('32 characters');await g4.getByLabel('Invite link').fill(link);
 await g4.getByRole('button',{name:'Join',exact:true}).click();await expect(g4.getByTestId('guest-connected')).toHaveCount(0);
 await g4.screenshot({path:'test-results/identity-long-name.png'});await c4.close();
});
test('host uses the profile name; an over-long profile name asks for a session name first',async({browser})=>{
 const c=await mkCtx(browser,true,{nickname:'M'.repeat(40),avatar:''});const p=await c.newPage();
 await p.goto('/');await open(p,'Share project...');
 await p.getByLabel('Relay address').fill(`ws://127.0.0.1:${port}`);
 await expect(p.getByTestId('host-name-long')).toBeVisible();await expect(p.getByRole('button',{name:'Start sharing'})).toBeDisabled();
 await p.getByLabel('Your name').fill('Short host');await expect(p.getByRole('button',{name:'Start sharing'})).toBeEnabled();
 await p.getByRole('button',{name:'Start sharing'}).click();await expect(p.getByTestId('participants')).toContainText('Short host');
 expect((await profileOf(p)).nickname).toBe('M'.repeat(40));await c.close();
});
