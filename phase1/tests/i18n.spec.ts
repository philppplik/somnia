import {test,expect} from './fixtures';
test.use({sample:false});
test('language follows the saved choice, defaults to English and falls back for unknown languages',async({page})=>{
 await page.setViewportSize({width:1400,height:900});
 await page.goto('/');
 await expect(page.getByTestId('empty-state').getByRole('button',{name:'Open folder'})).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('lang','en');
 await page.evaluate(()=>localStorage.setItem('somnia.locale.v1','de'));await page.reload();
 await expect(page.getByTestId('empty-state').getByRole('button',{name:'Ordner öffnen'})).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('lang','de');
 await page.evaluate(()=>localStorage.setItem('somnia.locale.v1','xx'));await page.reload();
 await expect(page.getByTestId('empty-state').getByRole('button',{name:'Open folder'})).toBeVisible();});
