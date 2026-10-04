import {test,expect} from './fixtures';
test('editing a CSS file keeps the linked HTML in the preview and the UI responsive',async({page})=>{
 await page.goto('/');const f=page.frameLocator('iframe[title="Sandboxed design preview"]');
 await expect(f.locator('h1')).toBeVisible();

 await page.getByRole('button',{name:'Split view',exact:true}).click();
 const tab=(n:string)=>page.getByRole('tab',{name:n});await page.getByRole('button',{name:'Files panel'}).click();await page.getByRole('button',{name:'Open styles.css'}).click();
 await expect(page.getByText('Select an HTML file for design view.')).toHaveCount(0);
 await expect(f.locator('h1')).toBeVisible();
 await f.locator('h1').click();
 await page.getByLabel('Source code').click();await page.keyboard.type('/* edit */');
 await expect(f.locator('h1')).toBeVisible();
 await page.getByRole('button',{name:'Desktop viewport'}).click();
 await tab('index.html').click();await expect(f.locator('h1')).toBeVisible();
});
