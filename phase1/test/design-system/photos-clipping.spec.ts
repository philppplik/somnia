import {test,expect} from '@playwright/test';
test.use({viewport:{width:1200,height:900}});
test('clipping overlay: false-color canvas renders and toggles',async({page})=>{
 await page.goto('/test/design-system/?view=photos-clipping');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await expect(page.getByTestId('photos-clipping')).toBeEnabled();
 await page.getByTestId('photos-clipping').click();
 await expect(page.getByTestId('photos-clipping-canvas')).toBeVisible();
 await expect(page.getByTestId('photos-clipping')).toHaveAttribute('aria-pressed','true');
 await page.getByTestId('photos-clipping').click();
 await expect(page.getByTestId('photos-clipping-canvas')).toHaveCount(0);
});
test('clipping overlay renders in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-clipping');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  const toggle=page.getByTestId('photos-clipping');
  if(await toggle.count()){
   if(await toggle.getAttribute('aria-pressed')!=='true')await toggle.click();
   await expect(page.getByTestId('photos-clipping-canvas')).toBeVisible();
  }
  await page.waitForTimeout(500);
  await page.screenshot({path:`test-results/ds-photos-clipping-${theme}.png`,fullPage:true});
  if(await toggle.count()){await toggle.click();await expect(page.getByTestId('photos-clipping-canvas')).toHaveCount(0);}
  await page.waitForTimeout(200);
  await page.getByTestId('photos-stage').screenshot({path:`test-results/ds-photos-clipping-stage-${theme}.png`});
 }
});
