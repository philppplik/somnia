import {test,expect} from '@playwright/test';
test.use({viewport:{width:1200,height:1000}});
test('export proof: project export dialog renders migrated controls',async({page})=>{
 await page.goto('/test/design-system/?view=export');
 await expect(page.getByTestId('export-proof')).toBeVisible();
 await expect(page.getByRole('radiogroup')).toBeVisible();
 await page.locator('input[name="export-kind"]').nth(2).check();
 await expect(page.locator('.export-rows select')).toBeVisible();
});
test('convert proof: image conversion dialog renders migrated controls',async({page})=>{
 await page.goto('/test/design-system/?view=convert');
 await expect(page.getByTestId('convert-proof')).toBeVisible();
 await expect(page.getByText(/Original: 64 x 48 px/)).toBeVisible();
 await page.locator('.image-conversion-fields select').selectOption('jpeg');
 await expect(page.locator('.image-conversion-fields input[type="range"]')).toBeVisible();
 await expect(page.locator('.image-conversion-fields input[type="color"]')).toBeVisible();
});
test('export and convert dialogs render in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=export');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByRole('radiogroup')).toBeVisible();
  await page.locator('input[name="export-kind"]').nth(2).check();
  await expect(page.locator('.export-rows select')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({path:`test-results/ds-export-${theme}.png`,fullPage:true});
  await page.goto('/test/design-system/?view=convert');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByText(/Original: 64 x 48 px/)).toBeVisible();
  await page.locator('.image-conversion-fields select').selectOption('jpeg');
  await expect(page.locator('.image-conversion-fields input[type="color"]')).toBeVisible();
  await page.waitForTimeout(700);
  await page.screenshot({path:`test-results/ds-convert-${theme}.png`,fullPage:true});
 }
});
