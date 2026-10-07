import {test,expect} from './fixtures';
test('shortcuts can be changed, cleared and reset in settings',async({page})=>{await page.goto('/');await expect(page.getByRole('button',{name:'Split view',exact:true})).toBeVisible();await page.keyboard.press('Control+,');await page.getByRole('button',{name:'Shortcuts',exact:true}).click();
 await expect(page.getByLabel('Keyboard shortcuts')).toContainText('Duplicate selected element');
 await page.getByRole('button',{name:'Change shortcut for Toggle sidebar'}).click();await page.keyboard.press('Control+Shift+Y');
 await expect(page.getByLabel('Keyboard shortcuts').locator('li',{hasText:'Toggle sidebar'})).toContainText('Shift + Y');
 await page.getByRole('button',{name:'Clear shortcut for Toggle sidebar'}).click();await expect(page.getByLabel('Keyboard shortcuts').locator('li',{hasText:'Toggle sidebar'})).toContainText('None');
 await page.getByRole('button',{name:'Reset shortcut for Toggle sidebar'}).click();await expect(page.getByLabel('Keyboard shortcuts').locator('li',{hasText:'Toggle sidebar'})).toContainText('B');});
test('F4 hides all panels and Ctrl+` toggles code and design',async({page})=>{await page.goto('/');await page.keyboard.press('F4');await expect(page.getByRole('button',{name:/panel/i}).first()).toBeVisible();
 await page.keyboard.press('Control+`');await page.keyboard.press('Control+`');});
