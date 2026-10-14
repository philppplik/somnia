import {test,expect} from '@playwright/test';
test.use({viewport:{width:1200,height:1000}});
test('imgedit proof: panels render migrated controls',async({page})=>{
 await page.goto('/test/design-system/?view=imgedit');
 await expect(page.getByTestId('imgedit-proof')).toBeVisible();
});
test('imgedit proof panels render in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=imgedit');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('imgedit-proof')).toBeVisible();
  await page.screenshot({path:`test-results/ds-imgedit-${theme}.png`,fullPage:true});
 }
});
