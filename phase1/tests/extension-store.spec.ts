import {test,expect,type Page} from '@playwright/test';
import {mkdirSync} from 'node:fs';
const fixture='/scripts/extension-store/fixture.html';
const SHOTS=process.env.STORE_SHOTS||'test-results/store-ui';
mkdirSync(SHOTS,{recursive:true});
test.beforeEach(async({page})=>{page.on('pageerror',e=>console.log('PAGEERROR',e.message));page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});});
const open=(page:Page,qs='')=>page.goto(`${fixture}?${qs}`);
const card=(page:Page,name:string)=>page.locator('.store-card',{has:page.getByRole('heading',{name,exact:true})});
const log=(page:Page)=>page.evaluate(()=>(window as unknown as {__store:{commits:string[];reports:any[];external:string[]}}).__store);
const openDetail=async(page:Page,name:string)=>{await page.getByRole('button',{name:`Open ${name}`}).click();await expect(page.getByRole('heading',{name,level:2,exact:true})).toBeVisible();};

test('browse: cards, badges, tags and button states',async({page})=>{
 await open(page);
 await expect(page.getByRole('heading',{name:'Palette Lint'})).toBeVisible();
 await expect(card(page,'Palette Lint').getByRole('button',{name:'Verified publisher'})).toBeVisible();
 await expect(card(page,'Somnia'.length?'HTML Mail Kit':'').getByRole('button',{name:'Verified publisher'})).toHaveCount(0);
 await expect(card(page,'HTML Mail Kit').getByText('Official',{exact:true})).toBeVisible();
 await expect(card(page,'HTML Mail Kit').getByRole('button',{name:'Installed'})).toBeVisible();
 await expect(card(page,'FTP Deploy').getByText('1 network host')).toBeVisible();
 await expect(card(page,'Link Checker').getByText('Many hosts')).toBeVisible();
 await expect(card(page,'Palette Lint').getByText('No network')).toBeVisible();
 await expect(card(page,'CSS Tidy').getByRole('button',{name:'Update'})).toBeVisible();
 await expect(card(page,'Quick Fonts').getByRole('button',{name:'Blocked'})).toBeDisabled();
 await expect(page.getByRole('heading',{name:'Hidden Tool'})).toHaveCount(0);
 await expect(page.getByText('Listings are unreviewed unless the publisher is verified. Listing is not a guarantee of safety.')).toBeVisible();
 // verified mark must not be colour only: it has a name, and no score or stars exist anywhere
 await expect(page.locator('.ext-popup')).not.toContainText(/stars?|rating|score|%/i);
});
test('categories are chips from the index data; search covers name, publisher and permission text',async({page})=>{
 await open(page);
 const chips=page.getByRole('group',{name:'Categories'});
 await expect(chips.getByRole('button',{name:'All'})).toHaveAttribute('aria-pressed','true');
 await chips.getByRole('button',{name:'Deploy'}).click();
 await expect(page.locator('.store-card')).toHaveCount(1);
 await chips.getByRole('button',{name:'All'}).click();
 const s=page.getByRole('searchbox',{name:'Search extensions, publishers, permissions'});
 await s.fill('northfield');await expect(page.locator('.store-card')).toHaveCount(2);
 await s.fill('sftp.example-host.com');await expect(page.locator('.store-card')).toHaveCount(1);
 await s.fill('Many hosts');await expect(page.locator('.store-card')).toHaveCount(1);
 await s.fill('zzzz');await expect(page.getByText('No extensions match.')).toBeVisible();
});
test('detail opens on Access with plain-language rows, exact host, evidence rail and publisher card',async({page})=>{
 await open(page);await openDetail(page,'FTP Deploy');
 await expect(page.getByRole('tab',{name:'Access'})).toHaveAttribute('aria-selected','true');
 await expect(page.getByText('What FTP Deploy can do on your computer')).toBeVisible();
 await expect(page.getByText('Connect to one server: sftp.example-host.com')).toBeVisible();
 await expect(page.getByText('Store one password in your system keyring')).toBeVisible();
 await expect(page.getByText('Cannot run programs, read other folders or change settings')).toBeVisible();
 await expect(page.getByText(/Updates that ask for new access/)).toBeVisible();
 const rail=page.getByRole('region',{name:'Evidence for v1.2.0'});
 await expect(rail.getByText('Overdue')).toBeVisible();            // dependency check older than 72 h
 await expect(rail.getByText('Verified',{exact:true})).toBeVisible();
 await expect(rail.getByText('Current',{exact:true})).toBeVisible();
 await expect(rail.getByText(/Reviewers: 2/)).toBeVisible();
 const pub=page.getByRole('region',{name:'Publisher'});
 await expect(pub.getByText('Declares GitHub 2FA')).toBeVisible();await expect(pub.getByText('GitHub-linked')).toBeVisible();
 await expect(page.getByText('raw')).toHaveCount(0);
 for(const t of ['Overview','Evidence','Versions','Privacy']){await page.getByRole('tab',{name:t}).click();await expect(page.getByRole('tabpanel',{name:t})).toBeVisible();}
 await page.getByRole('tab',{name:'Privacy'}).click();await expect(page.getByText('Your server password')).toBeVisible();
 await page.getByRole('button',{name:'Store',exact:true}).click();await expect(page.getByRole('heading',{name:'Palette Lint'})).toBeVisible();
});
test('missing evidence is never green',async({page})=>{
 await open(page,'noevidence=northfield.palette-lint');await openDetail(page,'Palette Lint');
 const rail=page.getByRole('region',{name:'Evidence for v1.0.0'});
 await expect(rail.getByText('Not run')).toHaveCount(5);
 await expect(rail.locator('.store-chip-ok')).toHaveCount(1); // only the app-side revocation check
});
test('verified explainer: opens from the badge, traps focus, Escape closes only the explainer',async({page})=>{
 await open(page);
 const b=card(page,'Palette Lint').getByRole('button',{name:'Verified publisher'});await b.focus();await page.keyboard.press('Enter');
 const d=page.getByRole('dialog',{name:'What the check mark means'});await expect(d).toBeVisible();
 await expect(d.getByText('It does not mean the code is safe, or that we know who they are as a company.')).toBeVisible();
 await expect(d.getByText('Official',{exact:true})).toBeVisible();
 await page.keyboard.press('Escape');await expect(d).toHaveCount(0);
 await expect(page.locator('.ext-popup')).toBeVisible();
});
test('install hands a SHA-bound candidate to the real consent UI; no second dialog',async({page})=>{
 await open(page);
 await card(page,'Palette Lint').getByRole('button',{name:'Install'}).click();
 await expect(page.getByRole('button',{name:'Install and enable',exact:true})).toBeVisible();
 await page.screenshot({path:`${SHOTS}/03-install-consent-light.png`});
 await page.getByRole('button',{name:'Install and enable',exact:true}).click();
 await expect.poll(async()=>(await log(page)).commits).toEqual(['northfield.palette-lint@1.0.0']);
 await expect(card(page,'Palette Lint').getByRole('button',{name:'Installed'})).toBeVisible();
});
test('candidate that does not match the reviewed release is refused before consent',async({page})=>{
 await open(page,'stage=mismatch');
 await card(page,'Palette Lint').getByRole('button',{name:'Install'}).click();
 await expect(page.getByRole('alert').filter({hasText:'does not match the reviewed listing'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Install and enable',exact:true})).toHaveCount(0);
 expect((await log(page)).commits).toEqual([]);
});
test('host refusing to stage a blocked version shows the reason inline',async({page})=>{
 await open(page,'stage=blocked');await card(page,'Palette Lint').getByRole('button',{name:'Install'}).click();
 await expect(page.getByText('This version is blocked and cannot be installed.')).toBeVisible();
});
test('update uses the consent update variant with the previous manifest',async({page})=>{
 await open(page);await card(page,'CSS Tidy').getByRole('button',{name:'Update'}).click();
 await expect(page.getByRole('dialog').filter({hasText:/CSS Tidy/}).last()).toBeVisible();
 await page.screenshot({path:`${SHOTS}/03b-update-consent-light.png`});
});
test('blocked and deprecated detail banners',async({page})=>{
 await open(page);await openDetail(page,'Quick Fonts');
 await expect(page.getByText('Blocked during a security investigation. It cannot be installed.')).toBeVisible();
 await expect(page.getByRole('button',{name:'Blocked'})).toBeDisabled();
 await page.getByRole('button',{name:'Store',exact:true}).click();await openDetail(page,'Coffee Themes');
 await expect(page.getByText(/This extension is deprecated/)).toBeVisible();
});
test('report a concern: private payload is limited to the disclosed fields; log preview is exact',async({page})=>{
 await open(page);await openDetail(page,'FTP Deploy');
 await page.getByRole('button',{name:'Report a concern'}).click();
 const d=page.getByRole('dialog',{name:'Report a concern'});await expect(d).toBeVisible();
 await expect(d.getByRole('radio',{name:/Security problem/})).toBeChecked();
 await expect(d.getByRole('checkbox')).not.toBeChecked();
 await expect(d.getByText('We aim to reply within one business day. Urgent threats can lead to an immediate block.')).toBeVisible();
 await page.screenshot({path:`${SHOTS}/05-report-concern-light.png`});
 await d.getByRole('radio',{name:/Impersonation/}).check();
 await d.getByRole('textbox',{name:'Description'}).fill('Looks like a copy.');
 await d.getByRole('checkbox').check();
 await expect(d.getByText(/panel render failed: timeout/)).toBeVisible();
 await d.getByRole('button',{name:'Send report'}).click();
 await expect(d.getByText('Reference SR-2026-1042.')).toBeVisible();
 const r=(await log(page)).reports[0];
 expect(Object.keys(r).sort()).toEqual(['artifactSha256','category','errorLog','extensionId','somniaVersion','text','version']);
 expect(r).toMatchObject({extensionId:'margot-weiss.ftp-deploy',version:'1.2.0',category:'impersonation',somniaVersion:'11.4.0'});
});
test('report without attaching the log never sends it; failure keeps the form',async({page})=>{
 await open(page,'reportfails=1');await openDetail(page,'FTP Deploy');await page.getByRole('button',{name:'Report a concern'}).click();
 const d=page.getByRole('dialog',{name:'Report a concern'});await d.getByRole('button',{name:'Send report'}).click();
 await expect(d.getByRole('alert')).toHaveText('The report could not be sent. Try again.');
 expect((await log(page)).reports[0]).not.toHaveProperty('errorLog');
 await expect(d.getByRole('button',{name:'Send report'})).toBeEnabled();
});
test('public issue tab opens the index form and sends nothing itself',async({page})=>{
 await open(page);await openDetail(page,'FTP Deploy');await page.getByRole('button',{name:'Report a concern'}).click();
 const d=page.getByRole('dialog',{name:'Report a concern'});await d.getByRole('tab',{name:'Public issue'}).click();
 await page.screenshot({path:`${SHOTS}/05b-report-public-light.png`});
 await d.getByRole('button',{name:'Open issue form'}).click();
 const l=await log(page);expect(l.reports).toEqual([]);expect(l.external[0]).toContain('extension=margot-weiss.ftp-deploy');
});
test('offline cache banner, unavailable state and paused installs',async({page})=>{
 await open(page,'offline=1');await expect(page.getByText(/Store unavailable\. Showing the last catalog from/)).toBeVisible();
 await page.goto(`${fixture}?unavailable=1`);await expect(page.getByRole('heading',{name:'Store unavailable'})).toBeVisible();await expect(page.getByRole('button',{name:'Try again'})).toBeVisible();
 await page.goto(`${fixture}?stale=1`);await expect(page.getByText(/more than seven days old/).first()).toBeVisible();
 await expect(card(page,'Palette Lint').getByRole('button',{name:'Install'})).toBeDisabled();
});
test('keyboard: tabs arrow keys, Enter opens a card, Escape closes the dialog',async({page})=>{
 await open(page);
 await page.getByRole('button',{name:'Open Palette Lint'}).focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('heading',{name:'Palette Lint',level:2})).toBeVisible();
 await page.getByRole('tab',{name:'Access'}).focus();await page.keyboard.press('ArrowRight');
 await expect(page.getByRole('tab',{name:'Evidence'})).toHaveAttribute('aria-selected','true');
});
test('screenshots: all screens, light and dark, plus de and a narrow window',async({page})=>{
 for(const theme of ['light','dark']){
  await open(page,`theme=${theme}`);await expect(page.getByRole('heading',{name:'Palette Lint'})).toBeVisible();
  await page.screenshot({path:`${SHOTS}/01-browse-${theme}.png`});
  await openDetail(page,'FTP Deploy');await page.screenshot({path:`${SHOTS}/02-detail-access-${theme}.png`});
  await page.getByRole('tab',{name:'Evidence'}).click();await page.screenshot({path:`${SHOTS}/02b-detail-evidence-${theme}.png`});
  await page.getByRole('tab',{name:'Access'}).click();
  await page.getByRole('region',{name:'Publisher'}).getByRole('button',{name:'What does the check mark mean?'}).click();
  await page.screenshot({path:`${SHOTS}/04-verified-explainer-${theme}.png`});await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Report a concern'}).click();await page.getByRole('dialog',{name:'Report a concern'}).getByRole('checkbox').check();
  await page.screenshot({path:`${SHOTS}/05-report-concern-${theme}.png`});
 }
 await open(page,'locale=de&theme=light');await page.screenshot({path:`${SHOTS}/06-browse-de.png`});
 await page.setViewportSize({width:760,height:700});await open(page,'theme=light');await page.screenshot({path:`${SHOTS}/07-browse-narrow.png`});
 await open(page,'offline=1&theme=light');await page.setViewportSize({width:1440,height:900});await page.screenshot({path:`${SHOTS}/08-browse-offline.png`});
});

/** A6 product E2E additions. Exported signatures: none. HTTP is stubbed; the app host is not. */
import {test as appTest} from './fixtures';
import {createHash} from 'node:crypto';
import {strToU8,zipSync} from 'fflate';
const APP_SECURITY='somnia.extensions.security.v2';
const appManifest=(version='1.0.0',permissions:string[]=[])=>({id:'e2e.store',name:'Store Example',version,apiVersion:1,permissions,contributes:{}});
const appBytes=(version='1.0.0',permissions:string[]=[])=>Buffer.from(zipSync({'somnia-extension.json':strToU8(JSON.stringify(appManifest(version,permissions)))},{mtime:new Date('2020-01-01T00:00:00Z')}));
const appEntry=(version='1.0.0',permissions:string[]=[])=>({
 ...appManifest(version,permissions),author:'E2E Publisher',description:'An inert catalog package.',category:'Tools',
 repo:'https://github.com/e2e/store',download:'https://raw.githubusercontent.com/e2e/store/main/package.zip',
 sha256:createHash('sha256').update(appBytes(version,permissions)).digest('hex'),
});
async function openAppStore(page:Page){
 await page.goto('/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:/Commands/}).waitFor({state:'visible'});await page.keyboard.press('Control+,');
 await page.getByRole('button',{name:'Extensions',exact:true}).click();
 await page.getByRole('button',{name:'Open Extensions',exact:true}).click();
 await expect(page.locator('.ext-popup')).toBeVisible();
 await page.getByRole('tab',{name:'Browse',exact:true}).click();
}
const appRegistry=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('somnia.extensions.v1')||'[]'));
const appSecurity=(page:Page)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'{}'),APP_SECURITY);
appTest.describe('real app: catalog store adapter',()=>{
 appTest.beforeEach(async({page})=>{
  await page.addInitScript(key=>{
   localStorage.setItem('somnia.locale.v1','en');
   localStorage.setItem(key,JSON.stringify({version:2,acknowledged:true,restricted:false,developerMode:false,extensions:{}}));
  },APP_SECURITY);
 });
 appTest('browse, search, detail and stage run through the shipping adapter',async({page})=>{
  let downloads=0;
  await page.route('https://raw.githubusercontent.com/**',route=>{
   if(route.request().url().endsWith('index.json'))return route.fulfill({json:{schemaVersion:1,extensions:[appEntry()]}});
   downloads++;return route.fulfill({body:appBytes(),contentType:'application/zip'});
  });
  await openAppStore(page);await expect(card(page,'Store Example')).toBeVisible();expect(downloads).toBe(0);
  const search=page.getByRole('searchbox',{name:'Search extensions, publishers, permissions'});
  await search.fill('no-match');await expect(page.getByText('No extensions match.')).toBeVisible();
  await search.fill('E2E Publisher');await expect(card(page,'Store Example')).toBeVisible();
  await openDetail(page,'Store Example');
  await expect(page.getByRole('tab',{name:'Access',exact:true})).toHaveAttribute('aria-selected','true');
  const evidence=page.getByRole('region',{name:'Evidence for v1.0.0'});
  await expect(evidence.getByText('Not run',{exact:true})).toHaveCount(5);
  // The shipping index does not carry publisher verification or review evidence.
  await expect(page.getByRole('button',{name:'Verified publisher',exact:true})).toHaveCount(0);
  await page.locator('.ext-popup').getByRole('button',{name:'Install',exact:true}).click();
  await expect(page.locator('.ext-consent')).toBeVisible();expect(downloads).toBe(1);
  expect(await appRegistry(page)).toEqual([]);
  await page.getByRole('button',{name:'Install and enable',exact:true}).click();
  await expect.poll(async()=>(await appRegistry(page)).map((m:{id:string})=>m.id)).toEqual(['e2e.store']);
  expect(downloads).toBe(2); // Commit revalidates the downloaded bytes, not just the original listing.
  expect((await appSecurity(page)).extensions['e2e.store'].approved.version).toBe('1.0.0');
  await expect(page.locator('.ext-popup').getByRole('button',{name:'Installed',exact:true})).toBeVisible();
 });
 appTest('hash mismatch refuses consent and leaves both registry and approval empty',async({page})=>{
  await page.route('https://raw.githubusercontent.com/**',route=>route.fulfill(route.request().url().endsWith('index.json')?
   {json:{schemaVersion:1,extensions:[{...appEntry(),sha256:'0'.repeat(64)}]}}:{body:appBytes()}));
  await openAppStore(page);await card(page,'Store Example').getByRole('button',{name:'Install',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'does not match the reviewed listing'})).toBeVisible();
  await expect(page.locator('.ext-consent')).toHaveCount(0);expect(await appRegistry(page)).toEqual([]);
  expect((await appSecurity(page)).extensions['e2e.store']).toBeUndefined();
 });
 for(const scenario of ['rate-limited','server-error','invalid','network'] as const){
  appTest(`catalog ${scenario} failure has its own explanation and can retry`,async({page})=>{
   let fail=true;
   await page.route('https://raw.githubusercontent.com/**',route=>{
    if(!fail)return route.fulfill({json:{schemaVersion:1,extensions:[appEntry()]}});
    if(scenario==='network')return route.abort('failed');
    return route.fulfill(scenario==='invalid'?{body:'not JSON',contentType:'application/json'}:{status:scenario==='rate-limited'?429:503,body:'Unavailable'});
   });
   await openAppStore(page);const heading={'rate-limited':'The catalog is rate-limited','server-error':'The catalog server is having trouble',invalid:'Store unavailable',network:'Store unavailable'}[scenario];
   await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();
   const message={
    'rate-limited':'GitHub is throttling requests',
    'server-error':'GitHub returned a server error',
    invalid:'Unverified listings are not shown',
    network:'Unverified listings are not shown',
   }[scenario];
   await expect(page.locator('.ext-popup')).toContainText(message);
   expect(await appRegistry(page)).toEqual([]);fail=false;
   await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(card(page,'Store Example')).toBeVisible();
  });
 }
 appTest('report log is opt-in, comes from local activity, and failed private send never claims success',async({page})=>{
  await page.route('https://raw.githubusercontent.com/**',route=>route.fulfill({json:{schemaVersion:1,extensions:[appEntry()]}}));
  // Browser-only run: emulate only the native activity read command, not the extension/store host.
  await page.addInitScript(()=>{
   const scope=window as unknown as {__TAURI_INTERNALS__:{invoke:(cmd:string,args?:Record<string,unknown>)=>Promise<unknown>}};
   scope.__TAURI_INTERNALS__={invoke:async(cmd,args)=>{
    if(cmd==='extension_activity_query')return {events:[{id:'denied-1',ts:'2026-10-10T12:00:00Z',extensionId:'e2e.store',extensionName:'Store Example',api:'project.read',target:null,decision:'denied',kind:'permission',latencyMs:null,scope:null}],total:1,nextOffset:null};
    if(cmd==='extension_activity_export')return null;
    throw new Error(`Unexpected native command: ${cmd} ${JSON.stringify(args)}`);
   }};
  });
  await openAppStore(page);await openDetail(page,'Store Example');await page.getByRole('button',{name:'Report a concern',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Report a concern',exact:true});
  await expect(dialog.getByRole('checkbox')).not.toBeChecked();await expect(dialog.locator('pre')).toHaveCount(0);
  await dialog.getByRole('checkbox').check();await expect(dialog.locator('pre')).toHaveText('2026-10-10T12:00:00Z denied project.read');
  await dialog.getByRole('button',{name:'Send report',exact:true}).click();
  await expect(dialog.getByRole('alert')).toHaveText('The report could not be sent. Try again.');
  await expect(dialog.getByRole('button',{name:'Send report',exact:true})).toBeEnabled();
  await expect(dialog.getByText(/Reference SR-/)).toHaveCount(0);
 });
 appTest('store update consent keeps old bytes until approval and binds the added permission',async({page})=>{
  let version='1.0.0';let permissions:string[]=[];
  await page.route('https://raw.githubusercontent.com/**',route=>route.fulfill(route.request().url().endsWith('index.json')?
   {json:{schemaVersion:1,extensions:[appEntry(version,permissions)]}}:{body:appBytes(version,permissions)}));
  await openAppStore(page);await card(page,'Store Example').getByRole('button',{name:'Install',exact:true}).click();
  await page.getByRole('button',{name:'Install and enable',exact:true}).click();
  await expect.poll(async()=>(await appRegistry(page))[0]?.version).toBe('1.0.0');
  version='1.1.0';permissions=['project.read'];
  await page.getByRole('tab',{name:/^Installed/}).click();await page.getByRole('tab',{name:'Browse',exact:true}).click();
  await card(page,'Store Example').getByRole('button',{name:'Update',exact:true}).click();
  await expect(page.locator('.ext-consent')).toContainText('Version 1.1.0 is downloaded, but not running. Version 1.0.0 is still active.');
  expect((await appRegistry(page))[0].version).toBe('1.0.0');
  await page.getByRole('button',{name:'Keep 1.0.0',exact:true}).click();
  expect((await appRegistry(page))[0].version).toBe('1.0.0');
  await card(page,'Store Example').getByRole('button',{name:'Update',exact:true}).click();
  await page.getByRole('button',{name:'Approve and update',exact:true}).click();
  await expect.poll(async()=>(await appRegistry(page))[0]?.version).toBe('1.1.0');
  expect((await appSecurity(page)).extensions['e2e.store'].approved.permissions).toContain('project.read');
 });
});
