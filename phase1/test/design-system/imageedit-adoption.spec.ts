import {test,expect} from '@playwright/test';
test.use({viewport:{width:1200,height:1000}});
test('imageedit proof: panels render migrated controls',async({page})=>{
 await page.goto('/test/design-system/?view=imageedit');
 await expect(page.getByTestId('imageedit-proof')).toBeVisible();
 await expect(page.getByTestId('filter-panel')).toBeVisible();
 await expect(page.getByTestId('image-editor-history')).toBeVisible();
});
test('imageedit proof panels render in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=imageedit');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('imageedit-proof')).toBeVisible();
  await page.screenshot({path:`test-results/ds-imageedit-${theme}.png`,fullPage:true});
 }
});
