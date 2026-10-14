import {test,expect} from '@playwright/test';
test.use({viewport:{width:1200,height:900}});
test('photo navigation: prev/next switch the active photo with clamping',async({page})=>{
 await page.goto('/test/design-system/?view=photos-nav');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await expect(page.getByTestId('photos-position')).toHaveText('1 / 3');
 await expect(page.getByTestId('photos-prev')).toBeDisabled();
 await page.getByTestId('photos-next').click();
 await expect(page.getByTestId('photos-name')).toHaveText('nav-2.png');
 await expect(page.getByTestId('photos-position')).toHaveText('2 / 3');
 await expect(page.getByTestId('photos-prev')).toBeEnabled();
 await page.getByTestId('photos-next').click();
 await expect(page.getByTestId('photos-position')).toHaveText('3 / 3');
 await expect(page.getByTestId('photos-next')).toBeDisabled();
 await page.getByTestId('photos-prev').click();
 await expect(page.getByTestId('photos-name')).toHaveText('nav-2.png');
});
test('photo navigation renders in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-nav');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-name')).toHaveText('nav-1.png');
  await page.waitForTimeout(500);
  await page.getByTestId('photos-stage').screenshot({path:`test-results/ds-photos-nav-stage-${theme}.png`});
  const next=page.getByTestId('photos-next');
  if(await next.count()){await next.click();await expect(page.getByTestId('photos-position')).toHaveText('2 / 3');}
  await page.waitForTimeout(300);
  await page.screenshot({path:`test-results/ds-photos-nav-${theme}.png`,fullPage:true});
 }
});
