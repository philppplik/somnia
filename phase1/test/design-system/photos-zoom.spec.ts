import {test,expect} from '@playwright/test';
test.use({viewport:{width:1200,height:900}});
test('zoom presets jump between stops and track the active stop',async({page})=>{
 await page.goto('/test/design-system/?view=photos-zoom');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await expect(page.getByTestId('photos-zoom-fit')).toHaveAttribute('aria-pressed','true');
 for(const p of[100,200,400,50]){
  await page.getByTestId(`photos-zoom-preset-${p}`).click();
  await expect(page.getByTestId('photos-zoom-level')).toHaveText(`${p}%`);
  await expect(page.getByTestId(`photos-zoom-preset-${p}`)).toHaveAttribute('aria-pressed','true');
 }
 await page.getByTestId('photos-zoom-fit').click();
 await expect(page.getByTestId('photos-zoom-preset-100')).toHaveAttribute('aria-pressed','false');
});
test('zoom presets render in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-zoom');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await page.waitForTimeout(500);
  await page.getByTestId('photos-stage').screenshot({path:`test-results/ds-photos-zoom-stage-${theme}.png`});
  const preset=page.getByTestId('photos-zoom-preset-200');
  if(await preset.count()){await preset.click();await expect(page.getByTestId('photos-zoom-level')).toHaveText('200%');}
  await page.waitForTimeout(300);
  await page.screenshot({path:`test-results/ds-photos-zoom-${theme}.png`,fullPage:true});
 }
});
