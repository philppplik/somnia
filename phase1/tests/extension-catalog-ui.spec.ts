import {test,expect} from './fixtures';
import {createHash} from 'node:crypto';
import {strToU8,zipSync} from 'fflate';
const mk=(id:string,name:string,version:string,extra:Record<string,unknown>={})=>{
 const manifest={id,name,version,apiVersion:1,permissions:[] as string[],contributes:{codeThemes:[{id:'t',label:name,light:{'--syntax-tag':'#123456'},dark:{'--syntax-tag':'#abcdef'}}]},...extra};
 const bytes=Buffer.from(zipSync({'somnia-extension.json':strToU8(JSON.stringify(manifest))}));
 return{manifest,bytes,entry:{id,name,version,apiVersion:1,permissions:manifest.permissions,author:'Acme',description:`${name} description`,repo:'https://github.com/acme/x',download:`https://raw.githubusercontent.com/acme/x/v/${id}.zip`,sha256:createHash('sha256').update(bytes).digest('hex'),...('category' in extra?{}:{})}};
};
async function open(page:import('@playwright/test').Page){await page.goto('/');await page.keyboard.press('Control+,');await page.getByRole('button',{name:'Extensions',exact:true}).click();await page.getByRole('button',{name:'Browse GitHub extensions'}).click();}
function serve(page:import('@playwright/test').Page,items:ReturnType<typeof mk>[],cats:Record<string,string>={}){
 return page.route('https://raw.githubusercontent.com/**',route=>{const url=route.request().url();if(url.endsWith('index.json'))return route.fulfill({json:{schemaVersion:1,extensions:items.map(i=>({...i.entry,...(cats[i.entry.id]?{category:cats[i.entry.id]}:{})}))}});const hit=items.find(i=>url.endsWith(`${i.entry.id}.zip`));return hit?route.fulfill({body:hit.bytes}):route.fulfill({status:404});});
}
test('categories, search, status and permission filters narrow the list; clear resets',async({page})=>{
 const a=mk('acme.a','Alpha Theme','1.0.0'),b=mk('acme.b','Beta Tool','1.0.0',{permissions:['project.read']}),c=mk('acme.c','Gamma','1.0.0');
 await serve(page,[a,b,c],{'acme.a':'Themes','acme.b':'Tools'});await open(page);
 const list=page.getByLabel('Available extensions');await expect(list.getByRole('listitem')).toHaveCount(3);
 await page.getByRole('button',{name:/^Themes \(1\)/}).click();await expect(list).toContainText('Alpha Theme');await expect(list).not.toContainText('Beta Tool');
 await page.getByRole('button',{name:/^All \(3\)/}).click();await page.getByLabel('Search extensions').fill('gamma');await expect(list.getByRole('listitem')).toHaveCount(1);
 await page.getByLabel('Search extensions').fill('');await page.getByLabel('No permissions only').check();await expect(list).not.toContainText('Beta Tool');
 await page.getByLabel('Search extensions').fill('zzz');await expect(page.getByText('No matching extensions.')).toBeVisible();
 await page.getByRole('button',{name:'Clear filters'}).first().click();await expect(list.getByRole('listitem')).toHaveCount(3);
});
test('update available: banner, badge, Update installs new version off',async({page})=>{
 const v1=mk('acme.up','Upgrader','1.0.0'),v2=mk('acme.up','Upgrader','1.1.0');
 await serve(page,[v1],{});await open(page);await page.getByRole('button',{name:'Review Upgrader'}).click();await page.getByRole('button',{name:'Confirm install'}).click();
 await expect(page.getByLabel('Available extensions')).toContainText('Installed v1.0.0');await expect(page.getByTestId('update-banner')).toBeHidden();
 await page.unroute('https://raw.githubusercontent.com/**');await serve(page,[v2],{});await page.getByRole('button',{name:'Refresh index'}).click();
 await expect(page.getByTestId('update-banner')).toContainText('1 update is available');await expect(page.getByLabel('Available extensions')).toContainText('Update available (v1.0.0 to v1.1.0)');
 await page.getByLabel('Filter by status').selectOption('update-available');await expect(page.getByLabel('Available extensions').getByRole('listitem')).toHaveCount(1);
 await page.getByRole('button',{name:'Review Upgrader'}).click();await expect(page.getByRole('button',{name:'Confirm install'})).toBeVisible();await page.getByRole('button',{name:'Confirm install'}).click();
 await expect(page.getByTestId('update-banner')).toBeHidden();await expect(page.getByLabel('Enable Upgrader')).not.toBeChecked();
});
test('details page shows permissions, hash, source and installs; back returns to list',async({page})=>{
 const d=mk('acme.d','Detail Ext','2.0.0',{permissions:['project.read']});await serve(page,[d],{'acme.d':'Productivity'});await open(page);
 await page.getByRole('button',{name:'Details for Detail Ext'}).click();const sec=page.getByLabel('Extension details');
 await expect(sec).toContainText('Detail Ext');await expect(sec).toContainText('Read files from the open project');await expect(sec).toContainText(d.entry.sha256);await expect(sec).toContainText('Productivity');await expect(sec.getByRole('link',{name:'Source on GitHub'})).toHaveAttribute('href','https://github.com/acme/x');
 await sec.getByRole('button',{name:'Review Detail Ext'}).click();await expect(page.getByLabel('Review extension install')).toContainText('SHA-256 verified');await page.getByRole('button',{name:'Cancel install'}).click();
 await page.getByRole('button',{name:'Back to list'}).click();await expect(page.getByLabel('Available extensions')).toContainText('Detail Ext');
});
test('error shows plain message, details and Try again recovers; empty index message',async({page})=>{
 let fail=true;const e=mk('acme.e','Eventually','1.0.0');
 await page.route('https://raw.githubusercontent.com/**',route=>fail?route.fulfill({status:429,body:'x'}):route.fulfill({json:{schemaVersion:1,extensions:[e.entry]}}));
 await open(page);await expect(page.getByRole('alert')).toContainText('GitHub is limiting requests');await expect(page.getByRole('alert')).toContainText('429');await expect(page.getByRole('alert')).toContainText('Local file installs remain available');
 fail=false;await page.getByRole('button',{name:'Try again'}).click();await expect(page.getByLabel('Available extensions')).toContainText('Eventually');await expect(page.getByRole('alert')).toBeHidden();
 await page.unroute('https://raw.githubusercontent.com/**');await page.route('https://raw.githubusercontent.com/**',r=>r.fulfill({json:{schemaVersion:1,extensions:[]}}));
 await page.getByRole('button',{name:'Refresh index'}).click();await expect(page.getByText('No extensions are listed yet.')).toBeVisible();await expect(page.getByLabel('Search extensions')).toBeHidden();
});
