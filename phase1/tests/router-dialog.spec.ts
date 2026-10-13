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
test('dialog screenshot after opening animation settles',async({page},testInfo)=>{
 for(const locale of ['en','de'])for(const theme of ['light','dark']){
  await page.goto(`/tests/fixtures/router-dialog.html?lang=${locale}&theme=${theme}`);await expect(page.getByRole('dialog')).toBeVisible();await page.waitForTimeout(400);
  await page.screenshot({path:testInfo.outputPath(`router-${locale}-${theme}.png`)});
 }
});
test('ready opens automatically without a dialog or choice',async({page})=>{
 await page.goto('/tests/fixtures/router-dialog.html?mode=ready');await expect(page.locator('body')).toHaveAttribute('data-status','opened');
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('body')).toHaveAttribute('data-asks','0');await expect(page.locator('body')).toHaveAttribute('data-answer','code');
});
test('ambiguous handler uses suggested candidate then the normal approval/commit flow',async({page})=>{
 await page.goto('/tests/fixtures/router-dialog.html?mode=choose');const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 await expect(dialog.locator('select option')).toHaveCount(2);await expect(dialog.locator('select')).toHaveValue('sound');await expect(dialog.locator('select option:checked')).toContainText('(suggested)');
 await expect(page.locator('body')).toHaveAttribute('data-commits','0');await expect(page.locator('body')).toHaveAttribute('data-approvals','0');
 await dialog.locator('select').selectOption('code');await dialog.getByRole('button',{name:'Open file',exact:true}).click();
 await expect(page.locator('body')).toHaveAttribute('data-status','opened');await expect(page.locator('body')).toHaveAttribute('data-answer','code');await expect(page.locator('body')).toHaveAttribute('data-approvals','1');await expect(page.locator('body')).toHaveAttribute('data-commits','1');
});
for(const mode of ['unsupported','invalid'])test(`${mode} only notifies and never shows a chooser`,async({page})=>{
 await page.goto(`/tests/fixtures/router-dialog.html?mode=${mode}`);await expect(page.locator('body')).toHaveAttribute('data-status',mode);await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.locator('body')).toHaveAttribute('data-asks','0');await expect(page.locator('body')).toHaveAttribute('data-commits','0');await expect(page.locator('body')).toHaveAttribute('data-notice',/^Could not open/);
});
test('cancel button keeps the session unchanged',async({page})=>{
 await page.goto('/tests/fixtures/router-dialog.html');const dialog=page.getByRole('dialog');await expect(dialog).toContainText('Open as text?');
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.locator('body')).toHaveAttribute('data-status','cancelled');await expect(page.locator('body')).toHaveAttribute('data-commits','0');await expect(page.locator('body')).toHaveAttribute('data-approvals','0');
});
