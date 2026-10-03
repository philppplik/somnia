import {test,expect} from '@playwright/test';
test('everyday shortcuts: duplicate, delete, undo, deselect',async({page})=>{
 await page.goto('/');const f=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(f.locator('h1')).toHaveCount(1);
 await f.locator('h1').click();await page.keyboard.press('Control+d');await expect(f.locator('h1')).toHaveCount(2);
 await page.keyboard.press('Control+z');await expect(f.locator('h1')).toHaveCount(1);
 await page.getByRole('button',{name:'h1',exact:true}).first().click();await page.keyboard.press('Delete');await expect(f.locator('h1')).toHaveCount(0);
 await page.keyboard.press('Control+z');await expect(f.locator('h1')).toHaveCount(1);
});
