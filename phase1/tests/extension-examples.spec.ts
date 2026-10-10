import {test,expect} from './fixtures';
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('somnia.extensions.security.v2',JSON.stringify({version:2,acknowledged:true,restricted:false,developerMode:false,extensions:{}})));});
async function install(page:any,name:string){await page.goto('/');await page.keyboard.press('Control+,');await page.getByRole('button',{name:'Extensions'}).click();
 await page.getByLabel('Extension file').setInputFiles(`examples/${name}/somnia-extension.json`);}
test('word-count example installs from a file and reports words',async({page})=>{await install(page,'word-count');
 await page.getByLabel('Enable Word count').check();await page.keyboard.press('Escape');
 await page.keyboard.press('Control+k');await page.keyboard.type('Count words');await page.keyboard.press('Enter');
 await expect(page.getByText(/index\.html: \d+ words/)).toBeVisible({timeout:8000});});
test('revoked permission blocks the API call with a clear message',async({page})=>{await install(page,'word-count');
 await page.getByLabel('Enable Word count').check();await page.getByLabel('Word count permission project.read').uncheck();await page.keyboard.press('Escape');
 await page.keyboard.press('Control+k');await page.keyboard.type('Count words');await page.keyboard.press('Enter');
 await expect(page.getByText(/needs the "project.read" permission/)).toBeVisible({timeout:8000});});
test('safe-links example installs with project.write listed',async({page})=>{await install(page,'safe-links');
 await expect(page.getByLabel('Safe external links permission project.write')).toBeChecked();});
