import {test,expect} from './fixtures';
import {showCode} from './helpers';
const editor=(page:any)=>page.getByLabel('Source code');
async function code(page:any){await page.goto('/');await showCode(page);}
test('auto-close tags can be switched off in settings',async({page})=>{await code(page);
 await editor(page).click();await page.keyboard.press('Control+a');await page.keyboard.type('<section>');
 await expect(editor(page)).toContainText('</section>');
 await page.locator('body').click({position:{x:2,y:2}});await page.keyboard.press('Control+,');await page.getByRole('button',{name:'Code editor',exact:true}).click();await page.getByLabel('Auto-close HTML tags').uncheck();await page.keyboard.press('Escape');
 await editor(page).click();await page.keyboard.press('Control+a');await page.keyboard.type('<aside>');
 await expect(editor(page)).not.toContainText('</aside>');});
test('lint gutter flags broken markup and can be disabled',async({page})=>{await code(page);
 await editor(page).click();await page.keyboard.press('Control+a');await page.keyboard.type('<div><span>x</div>');
 await expect(page.locator('.cm-lint-marker').first()).toBeVisible({timeout:5000});
 await page.locator('body').click({position:{x:2,y:2}});await page.keyboard.press('Control+,');await page.getByRole('button',{name:'Code editor',exact:true}).click();await page.getByLabel('Show syntax problems in the code gutter').uncheck();await page.keyboard.press('Escape');
 await expect(page.locator('.cm-lint-marker')).toHaveCount(0);});
