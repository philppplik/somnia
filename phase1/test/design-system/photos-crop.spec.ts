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
test('horizon drag: line while dragging, angle commits as one undo step, Escape disarms',async({page})=>{
 await page.goto('/test/design-system/?view=photos-crop');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await expect(page.getByTestId('photos-transform-panel')).toBeVisible();
 const stage=page.getByTestId('photos-stage');
 const box=await stage.boundingBox();
 const x0=box!.x+box!.width*0.3,y0=box!.y+box!.height*0.45,x1=box!.x+box!.width*0.7,y1=box!.y+box!.height*0.55;
 await page.getByTestId('photos-straighten-tool').click();
 await expect(page.getByTestId('photos-straighten-tool')).toHaveAttribute('aria-pressed','true');
 await page.mouse.move(x0,y0);await page.mouse.down();await page.mouse.move((x0+x1)/2,(y0+y1)/2);
 await expect(page.getByTestId('photos-straighten-line')).toBeVisible(); // live line mid-drag
 await page.mouse.move(x1,y1);await page.mouse.up();
 await page.waitForTimeout(500);
 const deg=(t:string|null)=>Number(String(t).replace(/[^0-9.-]/g,''));
 const angle=deg(await page.getByTestId('photos-value-straighten').textContent());
 expect(angle).toBeLessThan(-0.5);  // down-right slope levels counter-clockwise
 expect(angle).toBeGreaterThan(-30);
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await page.waitForTimeout(400);
 expect(deg(await page.getByTestId('photos-value-straighten').textContent())).toBe(0);
 await page.getByTestId('photos-straighten-tool').click();
 await page.keyboard.press('Escape');
 await expect(page.getByTestId('photos-straighten-tool')).toHaveAttribute('aria-pressed','false');
});
test('horizon tool renders in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-crop');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await page.getByTestId('photos-straighten-tool').click();
  const stage=page.getByTestId('photos-stage');
  const box=await stage.boundingBox();
  await page.mouse.move(box!.x+box!.width*0.3,box!.y+box!.height*0.45);await page.mouse.down();
  await page.mouse.move(box!.x+box!.width*0.7,box!.y+box!.height*0.5);await page.waitForTimeout(300);
  await page.screenshot({path:`test-results/ds-photos-straighten-${theme}.png`,fullPage:true});
  await page.mouse.up();
 }
});
