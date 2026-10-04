import {test,expect} from './fixtures';
test('canvas right-click selects the element and offers shared-history actions',async({page})=>{
 await page.goto('/');const frame=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(frame.locator('h1')).toBeVisible();
 await frame.locator('h1').click({button:'right'});const menu=page.getByRole('menu',{name:'Canvas actions'});await expect(menu).toBeVisible();
 await menu.getByRole('menuitem',{name:'Hide layer',exact:true}).click();await expect(frame.locator('h1')).toBeHidden();await expect(menu).toBeHidden();
 await page.keyboard.press('Control+z');await expect(frame.locator('h1')).toBeVisible();
 await frame.locator('h1').click({button:'right'});await expect(menu).toBeVisible();await page.keyboard.press('Escape');await expect(menu).toBeHidden();
});
test('canvas menu duplicates and deletes an element with undo',async({page})=>{
 await page.goto('/');const frame=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(frame.locator('h1')).toHaveCount(1);
 const menu=page.getByRole('menu',{name:'Canvas actions'});
 await frame.locator('h1').click({button:'right'});await menu.getByRole('menuitem',{name:'Duplicate',exact:true}).click();await expect(frame.locator('h1')).toHaveCount(2);
 await page.keyboard.press('Control+z');await expect(frame.locator('h1')).toHaveCount(1);
 await frame.locator('h1').click({button:'right'});await menu.getByRole('menuitem',{name:'Delete',exact:true}).click();await expect(frame.locator('h1')).toHaveCount(0);
 await page.keyboard.press('Control+z');await expect(frame.locator('h1')).toHaveCount(1);
});
