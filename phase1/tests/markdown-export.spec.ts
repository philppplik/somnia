import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
test('Export active file as Markdown downloads a .md file with converted content',async({page})=>{
 await page.goto('/');await expect(page.frameLocator('iframe[title="Sandboxed design preview"]').locator('h1')).toBeVisible();
 await page.keyboard.press('Control+k');await page.getByRole('combobox',{name:'Search commands'}).fill('markdown');
 const download=page.waitForEvent('download');await page.getByRole('option',{name:/Export active file as Markdown/}).click();
 const file=await download;expect(file.suggestedFilename()).toMatch(/\.md$/);
 const text=readFileSync(await file.path()!,'utf8');expect(text).toContain('# Make room for something new.');
});
