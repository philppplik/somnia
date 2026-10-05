import {test,expect} from './fixtures';
import {createHash} from 'node:crypto';
import {strToU8,zipSync} from 'fflate';
const manifest={id:'acme.colors',name:'Calm Colors',version:'1.0.0',apiVersion:1,permissions:[],contributes:{codeThemes:[{id:'calm',label:'Calm',light:{'--syntax-tag':'#123456'},dark:{'--syntax-tag':'#abcdef'}}]}};
const bytes=Buffer.from(zipSync({'somnia-extension.json':strToU8(JSON.stringify(manifest))}));
const entry={...manifest,author:'Acme',description:'A quiet code theme.',repo:'https://github.com/acme/colors',download:'https://raw.githubusercontent.com/acme/colors/v1/package.zip',sha256:createHash('sha256').update(bytes).digest('hex')};
async function settings(page:import('@playwright/test').Page){await page.goto('/');await page.keyboard.press('Control+,');await page.getByRole('button',{name:'Extensions',exact:true}).click();}
test('catalog only fetches on Browse; review, cancel, install off and enable theme',async({page})=>{
 let requests=0;await page.route('https://raw.githubusercontent.com/**',route=>{requests++;return route.fulfill(route.request().url().endsWith('index.json')?{json:{schemaVersion:1,extensions:[entry]}}:{body:bytes,contentType:'application/zip'});});
 await settings(page);expect(requests).toBe(0);await page.getByRole('button',{name:'Browse GitHub extensions'}).click();await expect(page.getByLabel('Available extensions')).toContainText('Calm Colors');expect(requests).toBe(1);
 await page.getByRole('button',{name:'Review Calm Colors'}).click();await expect(page.getByLabel('Review extension install')).toContainText('SHA-256 verified');await expect(page.getByLabel('Installed extensions')).not.toContainText('Calm Colors');
 await page.getByRole('button',{name:'Cancel install'}).click();await expect(page.getByLabel('Review extension install')).toBeHidden();
 await page.getByRole('button',{name:'Review Calm Colors'}).click();await page.getByRole('button',{name:'Confirm install'}).click();await expect(page.getByLabel('Enable Calm Colors')).not.toBeChecked();
 await page.getByLabel('Enable Calm Colors').check();await page.getByRole('button',{name:'Code editor',exact:true}).click();await page.getByLabel('Syntax theme').selectOption('acme.colors.calm');await expect(page.locator('html')).toHaveAttribute('data-code-theme','acme.colors.calm');
 await page.getByRole('button',{name:'Extensions',exact:true}).click();await page.getByRole('button',{name:'Browse GitHub extensions'}).click();await page.getByRole('button',{name:'Review Calm Colors'}).click();await page.getByRole('button',{name:'Confirm install'}).click();await expect(page.getByLabel('Enable Calm Colors')).not.toBeChecked();
});
test('hash mismatch does not store an extension and local install stays available',async({page})=>{
 await page.route('https://raw.githubusercontent.com/**',route=>route.fulfill(route.request().url().endsWith('index.json')?{json:{schemaVersion:1,extensions:[{...entry,sha256:'0'.repeat(64)}]}}:{body:bytes}));await settings(page);await page.getByRole('button',{name:'Browse GitHub extensions'}).click();await page.getByRole('button',{name:'Review Calm Colors'}).click();await expect(page.getByRole('alert')).toContainText('SHA-256 mismatch');await expect(page.getByLabel('Installed extensions')).not.toContainText('Calm Colors');await expect(page.getByLabel('Extension manifest JSON')).toBeVisible();
});
test('permissions visible before confirm; search, empty index, error, close and retry',async({page})=>{
 let fail=true;const m={...manifest,permissions:['project.read']};const b=Buffer.from(zipSync({'somnia-extension.json':strToU8(JSON.stringify(m))}));
 await page.route('https://raw.githubusercontent.com/**',route=>route.fulfill(route.request().url().endsWith('index.json')?(fail?{status:503,body:'Unavailable'}:{json:{schemaVersion:1,extensions:[{...entry,permissions:m.permissions,sha256:createHash('sha256').update(b).digest('hex')}]}}):{body:b}));
 await settings(page);await page.getByRole('button',{name:'Browse GitHub extensions'}).click();await expect(page.getByRole('alert')).toContainText('503');fail=false;await page.getByRole('button',{name:'Refresh index'}).click();await page.getByLabel('Search extensions').fill('missing');await expect(page.getByText('No matching extensions.')).toBeVisible();await page.getByLabel('Search extensions').fill('');await page.getByRole('button',{name:'Review Calm Colors'}).click();await expect(page.getByLabel('Review extension install')).toContainText('Read files from the open project');await page.screenshot({path:'/tmp/extension-catalog-review.png'});
 await page.getByRole('button',{name:'Close browser'}).click();await expect(page.getByRole('button',{name:'Confirm install'})).toBeHidden();await page.route('**/index.json',route=>route.fulfill({json:{schemaVersion:1,extensions:[]}}));await page.getByRole('button',{name:'Browse GitHub extensions'}).click();await expect(page.getByText('No extensions are listed yet.')).toBeVisible();
});

test('catalog rejects worker code before presenting confirmation',async({page})=>{
 const b=Buffer.from(zipSync({'manifest.json':strToU8(JSON.stringify({...manifest,code:'self.postMessage({type:"activated"})'}))}));
 await page.route('https://raw.githubusercontent.com/**',route=>route.fulfill(route.request().url().endsWith('index.json')?{json:{schemaVersion:1,extensions:[{...entry,sha256:createHash('sha256').update(b).digest('hex')}]}}:{body:b}));
 await settings(page);await page.getByRole('button',{name:'Browse GitHub extensions'}).click();await page.getByRole('button',{name:'Review Calm Colors'}).click();await expect(page.getByRole('alert')).toContainText('worker code is not supported');await expect(page.getByRole('button',{name:'Confirm install'})).toBeHidden();await expect(page.getByLabel('Installed extensions')).not.toContainText('Calm Colors');
});
