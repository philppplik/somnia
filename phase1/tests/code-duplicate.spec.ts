import {test,expect} from '@playwright/test';
test('Ctrl+D duplicates the selection or the current line in the code editor',async({page})=>{await page.goto('/');await page.keyboard.press('Control+1');
 const ed=page.getByLabel('Source code');await ed.click();await page.keyboard.press('Control+a');await page.keyboard.type('abc');
 await page.keyboard.press('Control+d');await expect(ed).toContainText('abc');
 const lines=async()=>(await page.locator('.cm-line').allInnerTexts()).filter(t=>t.includes('abc')).length;
 await expect.poll(lines).toBe(2);
 await page.keyboard.press('Home');await page.keyboard.press('Shift+End');await page.keyboard.press('Control+d');
 await expect(ed).toContainText('abcabc');});
