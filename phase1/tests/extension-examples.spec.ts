import {test,expect} from './fixtures';
import {openAddExtension,enableExtension,openExtensionDetails} from './extension-popup-helpers';
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('somnia.extensions.security.v2',JSON.stringify({version:2,acknowledged:true,restricted:false,developerMode:false,extensions:{}})));});
async function install(page:import('@playwright/test').Page,name:string){
 await openAddExtension(page);
 await page.locator('input[type=file]').first().setInputFiles(`examples/${name}/somnia-extension.json`);
 await page.getByRole('checkbox',{name:'I reviewed these permissions',exact:true}).check();
 await page.getByRole('button',{name:'Install',exact:true}).click();await page.locator('.ext-consent').getByRole('button',{name:'Install and enable',exact:true}).click();
}
test('word-count example installs from a file and reports words',async({page})=>{await install(page,'word-count');
 await enableExtension(page,'Word count');await page.keyboard.press('Escape');
 await page.keyboard.press('Control+k');await page.keyboard.type('Count words');await page.keyboard.press('Enter');
 await expect(page.getByText(/index\.html: \d+ words/)).toBeVisible({timeout:8000});});
test('revoked permission blocks the API call with a clear message',async({page})=>{await install(page,'word-count');
 await enableExtension(page,'Word count');await openExtensionDetails(page,'Word count');await page.getByRole('switch',{name:'Read project files',exact:true}).uncheck();await page.keyboard.press('Escape');
 await page.keyboard.press('Control+k');await page.keyboard.type('Count words');await page.keyboard.press('Enter');
 await expect(page.getByText(/needs the "project.read" permission/)).toBeVisible({timeout:8000});});
test('safe-links example installs with project.write listed',async({page})=>{await install(page,'safe-links');
 await openExtensionDetails(page,'Safe external links');await expect(page.getByRole('switch',{name:'Edit project files',exact:true})).toBeChecked();});
