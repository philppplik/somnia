/** A6 product E2E. Exported signatures: none. Uses the shipping popup/host, never a fixture host. */
import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';
import {strToU8,zipSync} from 'fflate';
import {stringify} from 'smol-toml';

const SECURITY='somnia.extensions.security.v2';
const PACKAGES='somnia.extensions.v2.packages.v1';
const legacy={id:'e2e.local',name:'Local Example',version:'1.0.0',apiVersion:1,permissions:[]};
const manifest=(version='1.0.0',native=false)=>({
 manifestVersion:2,id:'e2e.package',publisher:'e2e',name:'Package Example',version,
 description:'An inert package used to verify the real install path.',license:'MIT',
 engines:{somnia:'>=11.0.0 <12.0.0',api:'>=2.0.0 <3.0.0'},runtime:{type:'declarative'},
 activationEvents:[],permissions:[],capabilities:{untrustedWorkspaces:{supported:'supported'},virtualWorkspaces:{supported:true}},
 contributes:{},dependencies:[],security:{tier:native?'B':'A'},
});
const toml=(version='1.0.0',native=false)=>stringify(manifest(version,native));
const packageBytes=(version='1.0.0',native=false)=>Buffer.from(zipSync({'somnia-extension.toml':strToU8(toml(version,native))},{mtime:new Date('2020-01-01T00:00:00Z')}));
const snapshot=(page:Page)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'{}'),SECURITY);
const installed=(page:Page)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'{}'),PACKAGES);
async function seed(page:Page,restricted=false,developerMode=false){
 await page.addInitScript(({key,restricted,developerMode})=>{
  localStorage.setItem('somnia.locale.v1','en');
  localStorage.setItem(key,JSON.stringify({version:2,acknowledged:true,restricted,developerMode,extensions:{}}));
 },{key:SECURITY,restricted,developerMode});
}
async function openAdd(page:Page){
 await page.goto('/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:/Commands/}).waitFor({state:'visible'});await page.keyboard.press('Control+,');
 await page.getByRole('button',{name:'Extensions',exact:true}).click();
 await page.getByRole('button',{name:'Open Extensions',exact:true}).click();
 await expect(page.locator('.ext-popup')).toBeVisible();
 await page.getByRole('navigation',{name:'Extensions sections'}).getByRole('button',{name:'+ Add extension',exact:true}).click();
}
async function paste(page:Page,text:string){
 await page.getByLabel('somnia-extension.toml',{exact:true}).fill(text);
 await page.getByRole('button',{name:'Inspect manifest',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Review before installing',exact:true})).toBeVisible();
}
async function review(page:Page){
 const install=page.locator('.ext-popup').getByRole('button',{name:'Install',exact:true});
 await expect(install).toBeDisabled();
 await page.getByRole('checkbox',{name:'I reviewed these permissions',exact:true}).check();
 await install.click();
}
async function confirm(page:Page,paused=false){
 await page.getByRole('button',{name:paused?'Install, keep paused':'Install and enable',exact:true}).click();
 await expect(page.locator('.ext-consent')).toHaveCount(0);
 await expect.poll(async()=>Object.keys(await installed(page))).toEqual(['e2e.package']);
}

test.describe('real app: local extension install',()=>{
 test('pasted legacy JSON requires consent and installs disabled with a bound approval',async({page})=>{
  await seed(page);await openAdd(page);await paste(page,JSON.stringify(legacy));await review(page);
  await expect(page.locator('.ext-consent')).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('somnia.extensions.v1')||'[]'))).toEqual([]);
  await page.getByRole('button',{name:'Install and enable',exact:true}).click();
  await expect(page.locator('.ext-popup')).toContainText('Local Example');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('somnia.extensions.v1')||'[]').map((m:{id:string})=>m.id))).toEqual(['e2e.local']);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('somnia.extensions.enabled.v1')||'[]'))).toEqual([]);
  expect((await snapshot(page)).extensions['e2e.local'].approved.version).toBe('1.0.0');
  expect((await snapshot(page)).extensions['e2e.local'].enabled).toBe(false);
 });
 for(const kind of ['somniax','json','toml'] as const){
  test(`file install reads actual ${kind} bytes, not just the filename`,async({page})=>{
   await seed(page);await openAdd(page);
   const buffer=kind==='somniax'?packageBytes():Buffer.from(kind==='json'?JSON.stringify(legacy):toml());
   await page.locator('.ext-add input[type=file]:not([webkitdirectory])').setInputFiles({name:kind==='toml'?'somnia-extension.toml':`example.${kind}`,mimeType:kind==='somniax'?'application/zip':'text/plain',buffer});
   await expect(page.getByRole('heading',{name:'Review before installing',exact:true})).toBeVisible();
   expect(Object.keys(await installed(page))).toEqual([]);
   await review(page);
   if(kind==='json'){
    await expect(page.locator('.ext-consent')).toBeVisible();
    await page.getByRole('button',{name:'Install and enable',exact:true}).click();
    await expect(page.locator('.ext-popup')).toContainText('Local Example');
    expect((await snapshot(page)).extensions['e2e.local'].approved.version).toBe('1.0.0');
  expect((await snapshot(page)).extensions['e2e.local'].enabled).toBe(false);
   }else{
    await expect(page.locator('.ext-consent')).toContainText('Package Example');
    expect(Object.keys(await installed(page))).toEqual([]);await confirm(page);
    expect((await snapshot(page)).extensions['e2e.package'].approved.version).toBe('1.0.0');
   }
  });
 }
 test('manifest paste: Inspect and Escape never approve or persist a package',async({page})=>{
  await seed(page);await openAdd(page);await paste(page,toml());
  expect(Object.keys(await installed(page))).toEqual([]);await review(page);
  await expect(page.locator('.ext-consent')).toBeVisible();await page.keyboard.press('Escape');
  await expect(page.locator('.ext-consent')).toHaveCount(0);
  expect(Object.keys(await installed(page))).toEqual([]);
  expect((await snapshot(page)).extensions['e2e.package']).toBeUndefined();
  await expect(page.getByLabel('somnia-extension.toml',{exact:true})).toHaveValue(toml());
 });
 test('malformed JSON, unknown permissions and missing entries fail before review',async({page})=>{
  await seed(page);await openAdd(page);
  for(const [text,message] of [
   ['{','The manifest is malformed.'],
   [JSON.stringify({...legacy,permissions:['network']}),'The manifest uses an unknown permission.'],
   [stringify({...manifest(),runtime:{type:'js',entry:'missing.js'}}),'An entry file is missing.'],
  ]){
   await page.getByLabel('somnia-extension.toml',{exact:true}).fill(text);
   await page.getByRole('button',{name:'Inspect manifest',exact:true}).click();
   await expect(page.locator('.ext-add').getByRole('alert')).toContainText(message);
   await expect(page.locator('.ext-popup').getByRole('button',{name:'Install',exact:true})).toHaveCount(0);
  }
  expect(Object.keys(await installed(page))).toEqual([]);
 });
 test('corrupt .somniax is refused even when its name looks valid',async({page})=>{
  await seed(page);await openAdd(page);
  await page.locator('.ext-add input[type=file]:not([webkitdirectory])').setInputFiles({name:'example.somniax',mimeType:'application/zip',buffer:Buffer.from('not a zip')});
  await expect(page.locator('.ext-add').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Review before installing',exact:true})).toHaveCount(0);
  expect(Object.keys(await installed(page))).toEqual([]);
 });
 test('restricted mode allows paused installation but blocks a runtime session',async({page})=>{
  await seed(page,true);await openAdd(page);await paste(page,toml());await review(page);await confirm(page,true);
  expect((await snapshot(page)).restricted).toBe(true);
  const result=await page.evaluate(async()=>{
   const modulePath='/src/lib/extensions/consentUiHost.ts';
   const {getConsentBroker}=await import(/* @vite-ignore */ modulePath);
   const broker=getConsentBroker();const m=broker.snapshot().extensions['e2e.package'].approved!;
   try{broker.openSession(m,{trusted:true,virtual:false});return 'unexpected session';}catch(e){return (e as Error).message;}
  });
  expect(result).toContain('E_RESTRICTED_MODE');
  await expect(page.locator('.ext-popup').getByRole('switch',{name:/Package Example/})).toHaveAttribute('aria-checked','false');
 });
 test('native package cannot reach install before Developer Mode is enabled',async({page})=>{
  await seed(page);await openAdd(page);await paste(page,toml('1.0.0',true));
  await page.getByRole('checkbox',{name:'I reviewed these permissions',exact:true}).check();
  await expect(page.getByRole('alert')).toContainText('Turn on Developer Mode first.');
  await expect(page.locator('.ext-popup').getByRole('button',{name:'Install',exact:true})).toBeDisabled();
  expect(Object.keys(await installed(page))).toEqual([]);
 });
 test('native consent needs an uninterrupted three-second hold; release and blur reset it',async({page})=>{
  await seed(page,false,true);await openAdd(page);await paste(page,toml('1.0.0',true));await review(page);
  const hold=page.getByRole('button',{name:'Hold for 3 seconds to install',exact:true});
  await hold.focus();await page.keyboard.down('Space');await page.waitForTimeout(1000);await page.keyboard.up('Space');
  expect(Object.keys(await installed(page))).toEqual([]);
  await hold.focus();await page.keyboard.down('Space');await page.waitForTimeout(300);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.waitForTimeout(3100);await page.keyboard.up('Space');
  expect(Object.keys(await installed(page))).toEqual([]);
  await hold.focus();await page.keyboard.down('Space');
  await expect.poll(async()=>Object.keys(await installed(page)),{timeout:6000}).toEqual(['e2e.package']);
  await page.keyboard.up('Space');await expect(page.locator('.ext-consent')).toHaveCount(0);
 });
 test('update consent preserves the installed version until approval; decline records the new version',async({page})=>{
  await seed(page);await openAdd(page);await paste(page,toml());await review(page);await confirm(page);
  await page.getByRole('navigation',{name:'Extensions sections'}).getByRole('button',{name:'+ Add extension',exact:true}).click();
  await paste(page,toml('1.1.0'));await review(page);
  await expect(page.locator('.ext-consent')).toContainText('Version 1.1.0 is downloaded, but not running. Version 1.0.0 is still active.');
  expect((await installed(page))['e2e.package'].manifest.version).toBe('1.0.0');
  await page.getByRole('button',{name:'Keep 1.0.0',exact:true}).click();
  expect((await snapshot(page)).extensions['e2e.package'].declinedVersions).toContain('1.1.0');
  expect((await installed(page))['e2e.package'].manifest.version).toBe('1.0.0');
  await page.locator('.ext-popup').getByRole('button',{name:'Install',exact:true}).click();await page.getByRole('button',{name:'Approve and update',exact:true}).click();
  await expect.poll(async()=>(await installed(page))['e2e.package'].manifest.version).toBe('1.1.0');
  expect((await snapshot(page)).extensions['e2e.package'].approved.version).toBe('1.1.0');
 });
});
