import {test,expect} from './fixtures';
import {openExtensions} from './extension-popup-helpers';
import {createHash} from 'node:crypto';
import {strToU8,zipSync} from 'fflate';
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('somnia.extensions.security.v2',JSON.stringify({version:2,acknowledged:true,restricted:false,developerMode:false,extensions:{}})));});
const mk=(id:string,name:string,version:string,extra:Record<string,unknown>={})=>{
 const manifest={id,name,version,apiVersion:1,permissions:[] as string[],contributes:{codeThemes:[{id:'t',label:name,light:{'--syntax-tag':'#123456'},dark:{'--syntax-tag':'#abcdef'}}]},...extra};
 const bytes=Buffer.from(zipSync({'somnia-extension.json':strToU8(JSON.stringify(manifest))}));
 return{manifest,bytes,entry:{id,name,version,apiVersion:1,permissions:manifest.permissions,author:'Acme',description:`${name} description`,repo:'https://github.com/acme/x',download:`https://raw.githubusercontent.com/acme/x/v/${id}.zip`,sha256:createHash('sha256').update(bytes).digest('hex')}};
};
async function open(page:import('@playwright/test').Page){await openExtensions(page);await page.getByRole('tab',{name:'Browse',exact:true}).click();}
const card=(page:import('@playwright/test').Page,name:string)=>page.locator('.store-card',{has:page.getByRole('heading',{name,exact:true})});
function serve(page:import('@playwright/test').Page,items:ReturnType<typeof mk>[],cats:Record<string,string>={}){
 return page.route('https://raw.githubusercontent.com/**',route=>{const url=route.request().url();if(url.endsWith('index.json'))return route.fulfill({json:{schemaVersion:1,extensions:items.map(i=>({...i.entry,...(cats[i.entry.id]?{category:cats[i.entry.id]}:{})}))}});const hit=items.find(i=>url.endsWith(`${i.entry.id}.zip`));return hit?route.fulfill({body:hit.bytes}):route.fulfill({status:404});});
}
test('category chips and permission-aware text search narrow the list; clearing text resets',async({page})=>{
 const a=mk('acme.a','Alpha Theme','1.0.0'),b=mk('acme.b','Beta Tool','1.0.0',{permissions:['project.read']}),c=mk('acme.c','Gamma','1.0.0');
 await serve(page,[a,b,c],{'acme.a':'Themes','acme.b':'Tools'});await open(page);
 const list=page.locator('.store-grid');await expect(list.locator('.store-card')).toHaveCount(3);
 await page.getByRole('group',{name:'Categories'}).getByRole('button',{name:'Themes',exact:true}).click();await expect(list).toContainText('Alpha Theme');await expect(list).not.toContainText('Beta Tool');
 await page.getByRole('group',{name:'Categories'}).getByRole('button',{name:'All',exact:true}).click();await page.getByRole('searchbox').fill('gamma');await expect(list.locator('.store-card')).toHaveCount(1);
 await page.getByRole('searchbox').fill('Read');await expect(list).toContainText('Beta Tool');await expect(list).not.toContainText('Alpha Theme');
 await page.getByRole('searchbox').fill('zzz');await expect(page.getByText('No extensions match.',{exact:true})).toBeVisible();
 await page.getByRole('searchbox').fill('');await expect(list.locator('.store-card')).toHaveCount(3);
});
test('update card opens version-bound consent; approving installs new version off',async({page})=>{
 const v1=mk('acme.up','Upgrader','1.0.0'),v2=mk('acme.up','Upgrader','1.1.0');
 await serve(page,[v1]);await open(page);await card(page,'Upgrader').getByRole('button',{name:'Install',exact:true}).click();await page.locator('.ext-consent').getByRole('button',{name:'Install and enable',exact:true}).click();
 await expect(card(page,'Upgrader').getByRole('button',{name:/^Installed(?: |$)/})).toBeVisible();await expect(page.getByTestId('update-banner')).toBeHidden();
 await page.unroute('https://raw.githubusercontent.com/**');await serve(page,[v2]);await page.getByRole('tab',{name:/^Installed(?: |$)/}).click();await page.getByRole('tab',{name:'Browse',exact:true}).click();
 await expect(card(page,'Upgrader')).toHaveAttribute('data-state','update');await expect(card(page,'Upgrader').getByRole('button',{name:'Update',exact:true})).toBeVisible();
 await expect(page.locator('.store-card')).toHaveCount(1);
 await card(page,'Upgrader').getByRole('button',{name:'Update',exact:true}).click();await expect(page.locator('.ext-consent')).toContainText('1.0.0');await expect(page.locator('.ext-consent')).toContainText('1.1.0');await page.locator('.ext-consent').getByRole('button',{name:'Approve and update',exact:true}).click();
 await expect(card(page,'Upgrader')).toHaveAttribute('data-state','installed');await expect(page.getByTestId('update-banner')).toBeHidden();await card(page,'Upgrader').getByRole('button',{name:/^Installed(?: |$)/}).click();await expect(page.getByRole('switch',{name:'Enable Upgrader',exact:true})).not.toBeChecked();
});
test('details page shows permissions, hash, source and installs; back returns to list',async({page})=>{
 const d=mk('acme.d','Detail Ext','2.0.0',{permissions:['project.read']});await serve(page,[d],{'acme.d':'Productivity'});await open(page);
 await page.getByRole('button',{name:'Open Detail Ext',exact:true}).click();await expect(page.getByRole('tabpanel',{name:'Access',exact:true})).toContainText('Read files in the project you open');
 await page.getByRole('tab',{name:'Evidence',exact:true}).click();await expect(page.getByRole('tabpanel',{name:'Evidence',exact:true})).toContainText(d.entry.sha256);
 await page.getByRole('tab',{name:'Overview',exact:true}).click();await expect(page.getByRole('tabpanel',{name:'Overview',exact:true})).toContainText('Productivity');const source=page.getByRole('button',{name:'github.com/acme/x',exact:true});await expect(source).toBeVisible();
 const [popup]=await Promise.all([page.waitForEvent('popup'),source.click()]);expect(popup.url()).toBe('https://github.com/acme/x');await popup.close();
 await page.getByRole('button',{name:'Install',exact:true}).click();await expect(page.locator('.ext-consent')).toContainText('Detail Ext');await page.locator('.ext-consent').getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Store',exact:true}).click();await expect(card(page,'Detail Ext')).toBeVisible();
});
test('error shows plain message, details and Try again recovers; empty index message',async({page})=>{
 let fail=true;const e=mk('acme.e','Eventually','1.0.0');
 await page.route('https://raw.githubusercontent.com/**',route=>fail?route.fulfill({status:429,body:'x'}):route.fulfill({json:{schemaVersion:1,extensions:[e.entry]}}));
 await open(page);await expect(page.getByRole('heading',{name:'The catalog is rate-limited',exact:true})).toBeVisible();
 await expect(page.locator('.ext-popup')).toContainText('GitHub is throttling requests');
 fail=false;await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(card(page,'Eventually')).toBeVisible();await expect(page.getByRole('heading',{name:'The catalog is rate-limited',exact:true})).toHaveCount(0);
 await page.unroute('https://raw.githubusercontent.com/**');await page.route('https://raw.githubusercontent.com/**',r=>r.fulfill({json:{schemaVersion:1,extensions:[]}}));
 await page.getByRole('tab',{name:/^Installed(?: |$)/}).click();await page.getByRole('tab',{name:'Browse',exact:true}).click();await expect(page.getByText('No extensions match.',{exact:true})).toBeVisible();
});

// Deprecated debt, accepted 2026-10-10: B8 removed permission/status dropdowns,
// Clear filters, update-banner and Refresh index. Current standards below cover
// permission-aware text search, honest unreviewed evidence and tab re-entry.
test('current Store standard: permission-aware search and category chips are independent',async({page})=>{
 const a=mk('acme.a','Alpha Theme','1.0.0'),b=mk('acme.b','Beta Tool','1.0.0',{permissions:['project.read']});
 await serve(page,[a,b],{'acme.a':'Themes','acme.b':'Tools'});await open(page);
 await page.getByRole('searchbox').fill('Read');await expect(page.locator('.store-card')).toHaveCount(1);await expect(card(page,'Beta Tool')).toBeVisible();
 await page.getByRole('group',{name:'Categories'}).getByRole('button',{name:'Themes',exact:true}).click();await expect(page.getByText('No extensions match.',{exact:true})).toBeVisible();
 await page.getByRole('searchbox').fill('');await expect(card(page,'Alpha Theme')).toBeVisible();
 await page.getByRole('group',{name:'Categories'}).getByRole('button',{name:'All',exact:true}).click();await expect(page.locator('.store-card')).toHaveCount(2);
});
test('current Store standard: index without review evidence never claims verified safety',async({page})=>{
 const d=mk('acme.d','Unreviewed Ext','1.0.0');await serve(page,[d]);await open(page);
 await expect(card(page,'Unreviewed Ext').getByText('Unreviewed',{exact:true})).toBeVisible();await expect(card(page,'Unreviewed Ext').getByRole('button',{name:'Verified publisher',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Open Unreviewed Ext',exact:true}).click();
 await expect(page.getByRole('region',{name:'Evidence for v1.0.0',exact:true})).toContainText('Not run');
 await page.getByRole('tab',{name:'Evidence',exact:true}).click();await expect(page.getByRole('tabpanel',{name:'Evidence',exact:true})).toContainText('Not run');
 await expect(page.getByRole('tabpanel',{name:'Evidence',exact:true})).toContainText(d.entry.sha256);
});
