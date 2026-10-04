import {test,expect} from '@playwright/test';
test('system theme follows the OS and named palettes apply',async({page})=>{
 await page.emulateMedia({colorScheme:'dark'});await page.goto('/');await page.keyboard.press('Control+,');
 await page.getByLabel('App theme').selectOption('system');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.getByLabel('App theme').selectOption('green');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await expect(page.locator('html')).toHaveAttribute('data-palette','green');
 await page.getByLabel('App theme').selectOption('cream');await expect(page.locator('html')).toHaveAttribute('data-theme','light');await expect(page.locator('html')).toHaveAttribute('data-palette','cream');
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-palette','cream');});
