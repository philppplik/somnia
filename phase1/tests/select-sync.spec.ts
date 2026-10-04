import {test,expect} from './fixtures';
test('clicking an element in the preview selects and focuses its source in the code editor',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Split view',exact:true}).click();
 const f=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(f.locator('h1')).toBeVisible();
 await f.locator('h1').click();
 const sel=page.locator('.cm-content');await expect(sel).toBeFocused();
 await expect(page.locator('.cm-selectionBackground').first()).toBeVisible();
 const text=await page.evaluate(()=>window.getSelection()?.toString()??'');
 expect(text).toContain('Make room for something new.');
 await f.locator('p').first().click();
 await expect.poll(()=>page.evaluate(()=>window.getSelection()?.toString()??'')).toContain('Your first idea');
});
