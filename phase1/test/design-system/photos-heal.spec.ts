import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
test.use({viewport:{width:1200,height:900}});
async function canvasBitmap(page:import('@playwright/test').Page){
 return page.evaluate(()=>(document.querySelector('[data-testid="photos-canvas"]') as HTMLCanvasElement).toDataURL('image/png'));
}
async function pixel(page:import('@playwright/test').Page,x:number,y:number){
 return page.evaluate(([px,py])=>{
  const c=document.querySelector('[data-testid="photos-canvas"]') as HTMLCanvasElement;
  return[...c.getContext('2d')!.getImageData(px,py,1,1).data];
 },[x,y]);
}
test('clone stamp: drag copies the clean area onto the defect, undo restores the source',async({page})=>{
 await page.goto('/test/design-system/?view=photos-heal');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 const toggle=page.getByTestId('photos-heal');
 await expect(toggle).toBeEnabled();
 const before=await canvasBitmap(page);
 expect(await pixel(page,70,60)).toEqual([210,40,40,255]); // the red defect is there
 await toggle.click();
 await expect(toggle).toHaveAttribute('aria-pressed','true');
 const box=await page.getByTestId('photos-canvas').boundingBox();
 const at=(nx:number,ny:number):[number,number]=>[box!.x+nx*box!.width,box!.y+ny*box!.height];
 await page.mouse.move(...at(0.2917,0.375)); // drag starts on the defect (target)
 await page.mouse.down();
 await expect(page.getByTestId('photos-heal-cursor')).toBeVisible();
 await page.mouse.move(...at(0.75,0.375),{steps:8}); // drag ends on clean green (source)
 await page.mouse.up();
 await page.waitForTimeout(700); // debounce + source re-encode + engine reload
 const healed=await canvasBitmap(page);
 expect(healed).not.toEqual(before);
 expect(await pixel(page,70,60)).toEqual([40,140,80,255]); // defect now carries the source green
 await page.screenshot({path:'test-results/ds-photos-heal-result.png',fullPage:true});
 await page.getByTestId('photos-undo').click();
 await page.waitForTimeout(700);
 expect(await canvasBitmap(page)).toEqual(before); // undo restores the untouched source
});
test('clone stamp: a plain click auto-picks a clean source',async({page})=>{
 await page.goto('/test/design-system/?view=photos-heal');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await page.getByTestId('photos-heal').click();
 const before=await canvasBitmap(page);
 const box=await page.getByTestId('photos-canvas').boundingBox();
 await page.mouse.click(box!.x+0.2917*box!.width,box!.y+0.375*box!.height); // click the defect, no drag
 await page.waitForTimeout(700);
 expect(await canvasBitmap(page)).not.toEqual(before);
 expect(await pixel(page,70,60)).toEqual([40,140,80,255]); // auto-source copied clean green
 await page.getByTestId('photos-undo').click();
 await page.waitForTimeout(700);
 expect(await canvasBitmap(page)).toEqual(before);
});
test('clone stamp: a stroke through the defect heals every path point from the release offset',async({page})=>{
 await page.goto('/test/design-system/?view=photos-heal');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 const before=await canvasBitmap(page);
 await page.getByTestId('photos-heal').click();
 const box=await page.getByTestId('photos-canvas').boundingBox();
 const at=(nx:number,ny:number):[number,number]=>[box!.x+nx*box!.width,box!.y+ny*box!.height];
 await page.mouse.move(...at(0.2917,0.25)); // start above the defect
 await page.mouse.down();
 await page.mouse.move(...at(0.2917,0.375),{steps:4}); // through the defect
 await page.mouse.move(...at(0.2917,0.625),{steps:4}); // below it
 await page.mouse.move(...at(0.75,0.5),{steps:6}); // release on clean green: the shared offset
 await page.mouse.up();
 await page.waitForTimeout(800);
 expect(await pixel(page,70,60)).toEqual([40,140,80,255]); // defect mid-point healed (start point alone would not have reached it)
 expect(await pixel(page,70,100)).toEqual([40,140,80,255]);
 await page.getByTestId('photos-undo').click();
 await page.waitForTimeout(800);
 expect(await canvasBitmap(page)).toEqual(before);
});
test('heal markers: rings show committed spots, clicking one deletes exactly that spot',async({page})=>{
 await page.goto('/test/design-system/?view=photos-heal');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 const before=await canvasBitmap(page);
 await page.getByTestId('photos-heal').click();
 await page.getByTestId('photos-heal-radius').fill('0.06'); // wide enough to cover the whole defect block
 const box=await page.getByTestId('photos-canvas').boundingBox();
 const at=(nx:number,ny:number):[number,number]=>[box!.x+nx*box!.width,box!.y+ny*box!.height];
 await page.mouse.click(...at(0.2917,0.375)); // spot 0 heals the red defect
 await page.waitForTimeout(700);
 await page.mouse.click(...at(0.6,0.375)); // spot 1 on clean green (green onto green)
 await page.waitForTimeout(700);
 await expect(page.locator('[data-testid="photos-heal-overlay"] [data-testid^="photos-heal-marker-"]')).toHaveCount(2);
 expect(await pixel(page,70,60)).toEqual([40,140,80,255]); // defect healed
 expect(await pixel(page,65,60)).toEqual([40,140,80,255]); // defect edge covered by the wider brush
 const withBoth=await canvasBitmap(page);
 await page.getByTestId('photos-heal-marker-0').click(); // delete the defect spot via its ring
 await page.waitForTimeout(700);
 await expect(page.locator('[data-testid="photos-heal-overlay"] [data-testid^="photos-heal-marker-"]')).toHaveCount(1);
 expect(await pixel(page,70,60)).toEqual([210,40,40,255]); // the defect is back
 expect(await canvasBitmap(page)).toEqual(before); // the remaining spot heals green onto green: pristine pixels
 await page.getByTestId('photos-undo').click(); // ONE undo restores the deleted spot
 await page.waitForTimeout(700);
 await expect(page.locator('[data-testid="photos-heal-overlay"] [data-testid^="photos-heal-marker-"]')).toHaveCount(2);
 expect(await canvasBitmap(page)).toEqual(withBoth);
 await page.screenshot({path:'test-results/ds-photos-heal-markers.png',fullPage:true});
});
test('clone stamp mode renders in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-heal');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  const toggle=page.getByTestId('photos-heal');
  if(await toggle.count()){
   await toggle.click();
   await expect(toggle).toHaveAttribute('aria-pressed','true');
   const box=await page.getByTestId('photos-canvas').boundingBox();
   await page.mouse.move(box!.x+0.5*box!.width,box!.y+0.5*box!.height);
   await expect(page.getByTestId('photos-heal-cursor')).toBeVisible();
  }
  await page.waitForTimeout(500);
  await page.screenshot({path:`test-results/ds-photos-heal-${theme}.png`,fullPage:true});
  writeFileSync(`test-results/ds-photos-heal-canvas-${theme}.png`,Buffer.from((await canvasBitmap(page)).split(',')[1],'base64'));
 }
});
test('heal mode: the toggle switches new spots to texture-blend healing',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-heal');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await page.getByTestId('photos-heal').click();
  const mode=page.getByTestId('photos-heal-mode');
  await expect(mode).toBeVisible();
  if(await mode.getAttribute('aria-pressed')!=='true')await mode.click(); // panel state persists across the theme loop
  await expect(mode).toHaveAttribute('aria-pressed','true');
  await page.getByTestId('photos-heal-radius').fill('0.06'); // cover the whole defect block
  const box=await page.getByTestId('photos-canvas').boundingBox();
  await page.mouse.click(box!.x+0.2917*box!.width,box!.y+0.375*box!.height); // heal-mode click on the red defect
  await page.waitForTimeout(700);
  const c=await pixel(page,70,60);
  expect(Math.abs(c[0]-40)).toBeLessThanOrEqual(3); // healed toward the green surround
  expect(Math.abs(c[1]-140)).toBeLessThanOrEqual(3);
  expect(Math.abs(c[2]-80)).toBeLessThanOrEqual(3);
  await page.screenshot({path:`test-results/ds-photos-heal-mode-${theme}.png`,fullPage:true});
 }
});
