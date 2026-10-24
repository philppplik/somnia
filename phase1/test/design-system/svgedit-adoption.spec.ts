import {test,expect} from '@playwright/test';
test.use({viewport:{width:1200,height:1000}});
test('svgedit proof: fixture document edit commits through migrated controls',async({page})=>{
 await page.goto('/test/design-system/?view=svgedit');
 await expect(page.getByTestId('svgedit-proof')).toBeVisible();
 const width=page.getByTestId('svg-doc-width');
 await expect(width).toBeVisible();
 await width.fill('140');
 await width.blur();
 await expect(page.getByTestId('svg-snap-panel')).toBeVisible();
 await expect(page.getByTestId('svg-inspector')).toBeVisible();
});
test('svgedit proof panels render in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=svgedit');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('svg-doc-width')).toBeVisible();
  await page.screenshot({path:`test-results/ds-svgedit-${theme}.png`,fullPage:true});
 }
});
