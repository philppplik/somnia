import {test,expect} from '@playwright/test';
test('code editor right-click menu selects all and closes with Escape',async({page})=>{await page.goto('/');await page.keyboard.press('Control+1');
 const editor=page.getByLabel('Source code');await editor.click({button:'right'});
 const menu=page.getByRole('menu',{name:'Code editor actions'});await expect(menu).toBeVisible();
 await menu.getByRole('menuitem',{name:/Select all/}).click();await expect(menu).toBeHidden();
 await editor.click({button:'right'});await page.keyboard.press('Escape');await expect(menu).toBeHidden();});
