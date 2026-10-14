import {test,expect} from '@playwright/test';
test.use({viewport:{width:1200,height:1000}});
test('photos proof: panels render migrated controls on a stubbed session',async({page})=>{
 await page.goto('/test/design-system/?view=photos');
 await expect(page.getByTestId('photos-proof')).toBeVisible();
 await expect(page.getByTestId('photos-inspector')).toBeVisible();
 await expect(page.getByTestId('photos-history-panel')).toBeVisible();
 await expect(page.getByTestId('photos-presets-panel')).toBeVisible();
});
test('photos proof panels render in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-inspector')).toBeVisible();
  await page.screenshot({path:`test-results/ds-photos-${theme}.png`,fullPage:true});
 }
});
