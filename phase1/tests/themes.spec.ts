import {test,expect} from './fixtures';
test('system theme follows the OS and named palettes apply',async({page})=>{
 await page.emulateMedia({colorScheme:'dark'});await page.goto('/');await page.keyboard.press('Control+,');
 await page.getByLabel('App theme').selectOption('system');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.getByLabel('App theme').selectOption('green');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await expect(page.locator('html')).toHaveAttribute('data-palette','green');
 await page.getByLabel('App theme').selectOption('cream');await expect(page.locator('html')).toHaveAttribute('data-theme','light');await expect(page.locator('html')).toHaveAttribute('data-palette','cream');
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-palette','cream');});
test('new palettes apply and dialogs use a 25px radius',async({page})=>{await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();await page.getByRole('button',{name:'Settings',exact:true}).click();
 for(const [id,mode] of [['blueice','light'],['grape','dark'],['melon','light']]){await page.getByLabel('App theme').selectOption(id);await expect(page.locator('html')).toHaveAttribute('data-palette',id);await expect(page.locator('html')).toHaveAttribute('data-theme',mode);}
 await expect(page.locator('.dialog-popup').first()).toHaveCSS('border-radius','25px');
 await expect(page.getByLabel('App theme').locator('option',{hasText:'Coffee Shop'})).toHaveCount(1);await expect(page.getByLabel('App theme').locator('option',{hasText:'Forest Green'})).toHaveCount(1);});
