import {test,expect} from '@playwright/test';
test.use({viewport:{width:1200,height:1000}});
test('video proof: inspector renders migrated controls on a stubbed session',async({page})=>{
 await page.goto('/test/design-system/?view=video');
 await expect(page.getByTestId('video-proof')).toBeVisible();
 await expect(page.getByTestId('video-controls')).toBeVisible();
});
test('video proof panels render in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=video');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('video-controls')).toBeVisible();
  await page.screenshot({path:`test-results/ds-video-${theme}.png`,fullPage:true});
 }
});
