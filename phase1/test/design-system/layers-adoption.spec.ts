import {test,expect} from '@playwright/test';
test.use({viewport:{width:1200,height:1000}});
test('layers proof: toolbar, tabs and format/quality render migrated controls',async({page})=>{
 await page.goto('/test/design-system/?view=layers');
 await expect(page.getByTestId('layers-proof')).toBeVisible();
 await expect(page.locator('#raster-tab-adjust')).toBeVisible();
 const format=page.locator('label.image-editor-format select').first();
 await expect(format).toBeVisible();
 await format.selectOption('jpg');
 await expect(page.getByLabel(/quality/i)).toBeVisible();
});
test('layers tree proof: filter input, drag labels and context menu',async({page})=>{
 await page.goto('/test/design-system/?view=layers-tree');
 await expect(page.getByTestId('layers-tree-proof')).toBeVisible();
 await expect(page.locator('[data-layer-id="n1"]')).toBeVisible();
 await expect(page.getByPlaceholder(/filter/i)).toBeVisible();
 await page.locator('[data-layer-drag-label]').first().click({button:'right'});
 await expect(page.getByRole('menuitem').first()).toBeVisible();
});
test('layers proof panels render in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=layers');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  const format=page.locator('label.image-editor-format select').first();
  await expect(format).toBeVisible();
  await format.selectOption('jpg');
  await expect(page.getByLabel(/quality/i)).toBeVisible();
  await page.screenshot({path:`test-results/ds-layers-${theme}.png`,fullPage:true});
  await page.goto('/test/design-system/?view=layers-tree');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.locator('[data-layer-id="n1"]')).toBeVisible();
  await page.locator('[data-layer-drag-label]').first().click({button:'right'});
  await expect(page.getByRole('menuitem').first()).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({path:`test-results/ds-layers-tree-${theme}.png`,fullPage:true});
 }
});
