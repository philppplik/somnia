import {test,expect} from './fixtures';
import {openExtensions} from './extension-popup-helpers';
import {createHash} from 'node:crypto';
import {strToU8,zipSync} from 'fflate';
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('somnia.extensions.security.v2',JSON.stringify({version:2,acknowledged:true,restricted:false,developerMode:false,extensions:{}})));});
const manifest={id:'acme.colors',name:'Calm Colors',version:'1.0.0',apiVersion:1,permissions:[],contributes:{codeThemes:[{id:'calm',label:'Calm',light:{'--syntax-tag':'#123456'},dark:{'--syntax-tag':'#abcdef'}}]}};
const bytes=Buffer.from(zipSync({'somnia-extension.json':strToU8(JSON.stringify(manifest))}));
const entry={...manifest,author:'Acme',description:'A quiet code theme.',repo:'https://github.com/acme/colors',download:'https://raw.githubusercontent.com/acme/colors/v1/package.zip',sha256:createHash('sha256').update(bytes).digest('hex')};
const card=(page:import('@playwright/test').Page)=>page.locator('.store-card',{has:page.getByRole('heading',{name:'Calm Colors',exact:true})});
const registry=(page:import('@playwright/test').Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('somnia.extensions.v1')||'[]'));
test('catalog only fetches on Browse; review, cancel, install off and enable theme',async({page})=>{
 let requests=0;await page.route('https://raw.githubusercontent.com/**',route=>{requests++;return route.fulfill(route.request().url().endsWith('index.json')?{json:{schemaVersion:1,extensions:[entry]}}:{body:bytes,contentType:'application/zip'});});
 await openExtensions(page);expect(requests).toBe(0);await page.getByRole('tab',{name:'Browse',exact:true}).click();await expect(card(page)).toBeVisible();expect(requests).toBeGreaterThanOrEqual(1);
 await card(page).getByRole('button',{name:'Install',exact:true}).click();const review=page.locator('.ext-consent');await expect(review).toContainText('Calm Colors');expect(await registry(page)).toEqual([]);
 await review.getByRole('button',{name:'Cancel',exact:true}).click();await expect(review).toBeHidden();expect(await registry(page)).toEqual([]);
 await card(page).getByRole('button',{name:'Install',exact:true}).click();await review.getByRole('button',{name:'Install and enable',exact:true}).click();await expect(card(page).getByRole('button',{name:/^Installed(?: |$)/})).toBeVisible();
 // Store consent approves the package; legacy runtime remains off until the explicit popup switch.
 await card(page).getByRole('button',{name:/^Installed(?: |$)/}).click();await expect(page.getByRole('switch',{name:'Enable Calm Colors',exact:true})).not.toBeChecked();await page.getByRole('switch',{name:'Enable Calm Colors',exact:true}).check();
 await page.keyboard.press('Escape');await page.keyboard.press('Control+,');await page.getByRole('button',{name:'Code editor',exact:true}).click();await page.getByLabel('Syntax theme').selectOption('acme.colors.calm');await expect(page.locator('html')).toHaveAttribute('data-code-theme','acme.colors.calm');
});
test('hash mismatch does not store an extension and local install stays available',async({page})=>{
 await page.route('https://raw.githubusercontent.com/**',route=>route.fulfill(route.request().url().endsWith('index.json')?{json:{schemaVersion:1,extensions:[{...entry,sha256:'0'.repeat(64)}]}}:{body:bytes}));await openExtensions(page);await page.getByRole('tab',{name:'Browse',exact:true}).click();await card(page).getByRole('button',{name:'Install',exact:true}).click();await expect(page.getByRole('alert')).toContainText('does not match the reviewed listing');expect(await registry(page)).toEqual([]);await expect(page.locator('.ext-consent')).toHaveCount(0);
 await page.getByRole('button',{name:'+ Add extension',exact:true}).click();await expect(page.getByLabel('somnia-extension.toml',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Choose file',exact:true})).toBeVisible();
});
test('permissions visible before confirm; search, empty index, error, close and retry',async({page})=>{
 let fail=true;let empty=false;const m={...manifest,permissions:['project.read']};const b=Buffer.from(zipSync({'somnia-extension.json':strToU8(JSON.stringify(m))}));
 await page.route('https://raw.githubusercontent.com/**',route=>route.fulfill(route.request().url().endsWith('index.json')?(fail?{status:503,body:'Unavailable'}:{json:{schemaVersion:1,extensions:empty?[]:[{...entry,permissions:m.permissions,sha256:createHash('sha256').update(b).digest('hex')}]}}):{body:b}));
 await openExtensions(page);await page.getByRole('tab',{name:'Browse',exact:true}).click();await expect(page.getByRole('heading',{name:'The catalog server is having trouble',exact:true})).toBeVisible();fail=false;await page.getByRole('button',{name:'Try again',exact:true}).click();await page.getByRole('searchbox',{name:'Search extensions, publishers, permissions'}).fill('missing');await expect(page.getByText('No extensions match.',{exact:true})).toBeVisible();await page.getByRole('searchbox').fill('');await card(page).getByRole('button',{name:'Install',exact:true}).click();await expect(page.locator('.ext-consent')).toContainText('Can see your project files');await page.screenshot({path:'test-results/extension-catalog-review.png'});
 await page.locator('.ext-consent').getByRole('button',{name:'Close',exact:true}).click();await expect(page.locator('.ext-consent')).toHaveCount(0);empty=true;await page.getByRole('tab',{name:/^Installed(?: |$)/}).click();await page.getByRole('tab',{name:'Browse',exact:true}).click();await expect(page.getByText('No extensions match.',{exact:true})).toBeVisible();
});
test('catalog rejects worker code before presenting confirmation',async({page})=>{
 const b=Buffer.from(zipSync({'manifest.json':strToU8(JSON.stringify({...manifest,code:'self.postMessage({type:"activated"})'}))}));
 await page.route('https://raw.githubusercontent.com/**',route=>route.fulfill(route.request().url().endsWith('index.json')?{json:{schemaVersion:1,extensions:[{...entry,sha256:createHash('sha256').update(b).digest('hex')}]}}:{body:b}));await openExtensions(page);await page.getByRole('tab',{name:'Browse',exact:true}).click();await card(page).getByRole('button',{name:'Install',exact:true}).click();await expect(page.getByRole('alert')).toContainText('does not work with your Somnia');await expect(page.locator('.ext-consent')).toHaveCount(0);expect(await registry(page)).toEqual([]);
});
