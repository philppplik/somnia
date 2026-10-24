import {test,expect} from './fixtures';
test.use({sample:true});
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

for(const tag of ['en','de','es','fr','pt-BR'])test(`${tag}: Open fallback confirmation is localized`,async({page})=>{
 await page.goto(`/tests/fixtures/router-dialog.html?lang=${tag}`);
 const {readFileSync}=await import('node:fs');const cat=JSON.parse(readFileSync(`src/locales/${tag}.json`,'utf8'));
 const dialog=page.getByRole('dialog',{name:cat['openRouter.textTitle'],exact:true});await expect(dialog).toBeVisible();
 await expect(dialog).toContainText(cat['openRouter.textDescription']);await expect(dialog.getByRole('combobox',{name:cat['openRouter.studio'],exact:true})).toHaveValue('code');
 await expect(dialog.getByRole('button',{name:cat['openRouter.open'],exact:true})).toBeVisible();
});
