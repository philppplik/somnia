import {test,expect} from '@playwright/test';
test('editing a CSS file keeps the linked HTML in the preview and the UI responsive',async({page})=>{
 await page.goto('/');const f=page.frameLocator('iframe[title="Sandboxed design preview"]');
 await expect(f.locator('h1')).toBeVisible();

 await page.getByRole('button',{name:'Split view',exact:true}).click();
 const sel=page.getByLabel('Active source file');const options=await sel.locator('option').allTextContents();
 const css=options.find(o=>/\.css$/i.test(o));expect(css).toBeTruthy();
 await sel.selectOption(css!);
 await expect(page.getByText('Select an HTML file for design view.')).toHaveCount(0);
 await expect(f.locator('h1')).toBeVisible();
 await f.locator('h1').click();
 await expect(page.getByText('Selection',{exact:true})).toBeVisible();
 await page.getByLabel('Source code').click();await page.keyboard.type('/* edit */');
 await expect(f.locator('h1')).toBeVisible();
 await page.getByRole('button',{name:'Desktop viewport'}).click();
 await sel.selectOption('index.html');await expect(f.locator('h1')).toBeVisible();
});
