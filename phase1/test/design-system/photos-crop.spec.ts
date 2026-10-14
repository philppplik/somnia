import {test,expect} from '@playwright/test';
test.use({viewport:{width:1200,height:900}});
test('crop guides: thirds grid renders in crop mode and toggles',async({page})=>{
 await page.goto('/test/design-system/?view=photos-crop');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await page.getByTestId('photos-crop').click();
 await expect(page.getByTestId('photos-crop-overlay')).toBeVisible();
 await expect(page.getByTestId('photos-crop-grid')).toBeVisible();
 await expect(page.getByTestId('photos-crop-grid').locator('line')).toHaveCount(4);
 await expect(page.getByTestId('photos-crop-guides')).toHaveAttribute('aria-pressed','true');
 await page.getByTestId('photos-crop-guides').click();
 await expect(page.getByTestId('photos-crop-grid')).toHaveCount(0);
 await page.getByTestId('photos-crop-guides').click();
 await expect(page.getByTestId('photos-crop-grid')).toBeVisible();
});
test('crop guides render in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-crop');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await page.getByTestId('photos-crop').click();
  await expect(page.getByTestId('photos-crop-overlay')).toBeVisible();
  const toggle=page.getByTestId('photos-crop-guides');
  if(await toggle.count()){
   if(await toggle.getAttribute('aria-pressed')!=='true')await toggle.click();
   await expect(page.getByTestId('photos-crop-grid')).toBeVisible();
  }
  await page.waitForTimeout(500);
  await page.screenshot({path:`test-results/ds-photos-crop-${theme}.png`,fullPage:true});
  if(await toggle.count()){await toggle.click();await expect(page.getByTestId('photos-crop-grid')).toHaveCount(0);}
  await page.waitForTimeout(200);
  await page.getByTestId('photos-stage').screenshot({path:`test-results/ds-photos-crop-stage-${theme}.png`});
 }
});
