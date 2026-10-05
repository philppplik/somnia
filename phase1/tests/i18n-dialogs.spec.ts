import {test,expect} from './fixtures';
test.use({sample:false});
test('German status bar labels',async({page})=>{
 await page.setViewportSize({width:1400,height:900});
 await page.goto('/');
 await page.evaluate(()=>localStorage.setItem('somnia.locale.v1','de'));await page.reload();
 await expect(page.getByRole('button',{name:'Probleme ein-/ausblenden'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Vergrößern'})).toBeVisible();
 await expect(page.getByRole('group',{name:'Ansichtsgröße'})).toBeVisible();
 await expect(page.getByText(/Revision \d+/)).toBeVisible();
 await page.evaluate(()=>localStorage.setItem('somnia.locale.v1','en'));await page.reload();
 await expect(page.getByRole('button',{name:'Toggle problems'})).toBeVisible();});
