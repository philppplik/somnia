import {test,expect} from './fixtures';
test('Insert menu adds an element, Tools menu opens settings',async({page})=>{
 await page.goto('/');const f=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(f.locator('h1')).toBeVisible();
 await page.getByRole('button',{name:'main',exact:true}).first().click();
 const before=await f.locator('h2').count();
 await page.getByRole('button',{name:'Insert',exact:true}).click();await page.getByRole('menuitem',{name:'Heading'}).click();
 await expect(f.locator('h2')).toHaveCount(before+1);
 await page.getByRole('button',{name:'Tools',exact:true}).click();await page.getByRole('menuitem',{name:'Settings'}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
});
