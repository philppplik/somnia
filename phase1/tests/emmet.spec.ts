import {test,expect} from '@playwright/test';
test('Emmet abbreviation expands with Tab in HTML',async({page})=>{await page.goto('/');await page.keyboard.press('Control+1');
 const ed=page.getByLabel('Source code');await ed.click();await page.keyboard.press('Control+a');await page.keyboard.press('Delete');
 await page.keyboard.type('ul>li*2');await page.keyboard.press('Tab');
 const text=await page.locator('.cm-content').innerText();
 expect(text.replace(/\s+/g,'')).toContain('<ul><li></li><li></li></ul>');});
