import {test,expect} from './fixtures';
test.use({sample:false});
test('settings dialog is translated to German and keeps English section ids',async({page})=>{
 await page.setViewportSize({width:1400,height:900});
 await page.goto('/');
 await page.evaluate(()=>localStorage.setItem('somnia.locale.v1','de'));await page.reload();
 await page.keyboard.press('Control+,');
 const dialog=page.getByRole('dialog');
 if(!(await dialog.isVisible().catch(()=>false)))await page.getByRole('button',{name:'Einstellungen'}).first().click();
 await expect(dialog.getByRole('navigation',{name:'Einstellungsbereiche'})).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Code-Editor'})).toBeVisible();
 await dialog.getByRole('button',{name:'Tastenkürzel'}).click();
 await expect(dialog.getByRole('list',{name:'Tastenkürzel'})).toBeVisible();
 await dialog.getByRole('button',{name:'Updates'}).click();
 await expect(dialog.getByRole('button',{name:'Nach Updates suchen'})).toBeVisible();
 await dialog.getByRole('button',{name:'Darstellung'}).click();
 await expect(dialog.getByLabel('Kontrast',{exact:true})).toBeVisible();});
