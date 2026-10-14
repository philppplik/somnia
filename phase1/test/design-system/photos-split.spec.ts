import {test,expect} from '@playwright/test';
test.use({viewport:{width:1200,height:900}});
async function enableSplit(page:import('@playwright/test').Page){
 await page.goto('/test/design-system/?view=photos-split');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 const toggle=page.getByTestId('photos-split');
 await expect(toggle).toBeEnabled();
 if(await toggle.getAttribute('aria-pressed')!=='true')await toggle.click();
 await expect(page.getByTestId('photos-split-canvas')).toBeVisible();
}
test('split view: before/after overlay renders, divider drags, toggles',async({page})=>{
 await enableSplit(page);
 await expect(page.getByTestId('photos-split-divider')).toBeVisible();
 const before=await page.getByTestId('photos-split-handle').getAttribute('x1');
 const box=await page.getByTestId('photos-split-divider').boundingBox();
 await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);
 await page.mouse.down();
 await page.mouse.move(box!.x+box!.width/3,box!.y+box!.height/2,{steps:5});
 await page.mouse.up();
 const after=await page.getByTestId('photos-split-handle').getAttribute('x1');
 expect(Number(after)).toBeLessThan(Number(before));
 await page.getByTestId('photos-split').click();
 await expect(page.getByTestId('photos-split-canvas')).toHaveCount(0);
});
test('split view renders in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-split');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  const toggle=page.getByTestId('photos-split');
  if(await toggle.count()){
   if(await toggle.getAttribute('aria-pressed')!=='true')await toggle.click();
   await expect(page.getByTestId('photos-split-canvas')).toBeVisible();
   const box=await page.getByTestId('photos-split-divider').boundingBox();
   await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);
   await page.mouse.down();
   await page.mouse.move(box!.x+box!.width/3,box!.y+box!.height/2,{steps:5});
   await page.mouse.up();
  }
  await page.waitForTimeout(500);
  await page.screenshot({path:`test-results/ds-photos-split-${theme}.png`,fullPage:true});
  if(await toggle.count()){await toggle.click();await expect(page.getByTestId('photos-split-canvas')).toHaveCount(0);}
  await page.waitForTimeout(200);
  await page.getByTestId('photos-stage').screenshot({path:`test-results/ds-photos-split-stage-${theme}.png`});
 }
});
