import {test,expect} from '@playwright/test';
test('code theme picker in the code pane applies and persists',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Split view',exact:true}).click();
 await page.getByLabel('Code theme').selectOption('dracula');
 await expect(page.locator('html')).toHaveAttribute('data-code-theme','dracula');
 await page.screenshot({path:'/tmp/ct.png'});
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-code-theme','dracula');
});
