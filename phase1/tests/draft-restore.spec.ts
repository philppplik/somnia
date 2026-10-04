import {test,expect} from '@playwright/test';
test('unsaved memory-only draft survives a reload',async({page})=>{await page.goto('/');await page.keyboard.press('Control+1');
 const ed=page.getByLabel('Source code');await ed.click();await page.keyboard.press('Control+a');await page.keyboard.type('<h1>Draft survives</h1>');await page.waitForTimeout(1500);
 await page.reload();await page.keyboard.press('Control+1');await expect(page.locator('.cm-content')).toContainText('Draft survives');await expect(page.getByText(/Restored your unsaved draft/)).toBeVisible();});
