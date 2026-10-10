import {test,expect} from '@playwright/test';
const cases=[['en','Open file'],['de','Datei öffnen'],['es','Abrir archivo'],['fr','Ouvrir le fichier'],['pt-BR','Abrir arquivo']];
for(const [locale,open] of cases)test(`router dialog confirms safe choice in ${locale}`,async({page})=>{
 await page.goto(`/tests/fixtures/router-dialog.html?lang=${locale}`);
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 await expect(dialog.locator('select option')).toHaveCount(1);await expect(dialog.locator('select')).toHaveValue('code');
 await page.getByRole('button',{name:open,exact:true}).click();await expect(dialog).toBeHidden();await expect(page.locator('body')).toHaveAttribute('data-answer','code');
});
test('Escape cancels without choosing an editor',async({page})=>{
 await page.goto('/tests/fixtures/router-dialog.html');await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('body')).toHaveAttribute('data-answer','cancelled');
});
test('dialog screenshot after opening animation settles',async({page})=>{
 for(const locale of ['en','de'])for(const theme of ['light','dark']){
  await page.goto(`/tests/fixtures/router-dialog.html?lang=${locale}&theme=${theme}`);await expect(page.getByRole('dialog')).toBeVisible();await page.waitForTimeout(400);
  await page.screenshot({path:`/downloads/router-${locale}-${theme}.png`});
 }
});
