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
async function ready(page:import('@playwright/test').Page){
 await page.goto('/test/design-system/?view=photos-rad');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await page.getByTestId('photos-rad').click();
 await expect(page.getByTestId('photos-rad')).toHaveAttribute('aria-pressed','true');
 const box=await page.getByTestId('photos-canvas').boundingBox();
 return(nx:number,ny:number):[number,number]=>[box!.x+nx*box!.width,box!.y+ny*box!.height];
}
test('radial filter: a drag brightens an ellipse around the center, the corners stay untouched, undo restores',async({page})=>{
 const at=await ready(page);
 const before=await canvasBitmap(page);
 await page.getByTestId('photos-rad-ev').fill('0.7');
 await page.mouse.move(...at(0.35,0.3));
 await page.mouse.down();
 await page.mouse.move(...at(0.65,0.7),{steps:8}); // bounding box around the center
 await expect(page.getByTestId('photos-rad-overlay')).toBeVisible(); // in-flight draft shows
 await page.mouse.up();
 await page.waitForTimeout(800);
 const[r]=await pixel(page,120,80); // center: full 2^0.7
 expect(r).toBeGreaterThan(185);expect(r).toBeLessThan(205); // 120*1.62
 expect(await pixel(page,10,10)).toEqual([120,120,120,255]); // corner outside the ellipse
 await expect(page.locator('[data-testid="photos-rad-overlay"] ellipse')).toHaveCount(2); // outer + plateau edge
 await page.screenshot({path:'test-results/ds-photos-rad-result.png',fullPage:true});
 await page.getByTestId('photos-undo').click();
 await page.waitForTimeout(800);
 expect(await canvasBitmap(page)).toEqual(before);
});
test('radial markers: clicking the center handle deletes exactly that filter as one undo step',async({page})=>{
 const at=await ready(page);
 await page.getByTestId('photos-rad-ev').fill('0.7');
 await page.mouse.move(...at(0.15,0.2));await page.mouse.down();
 await page.mouse.move(...at(0.45,0.6),{steps:6});await page.mouse.up(); // filter 0 left
 await page.waitForTimeout(800);
 await page.mouse.move(...at(0.55,0.4));await page.mouse.down();
 await page.mouse.move(...at(0.85,0.8),{steps:6});await page.mouse.up(); // filter 1 right
 await page.waitForTimeout(800);
 await expect(page.locator('[data-testid="photos-rad-overlay"] [data-testid^="photos-rad-marker-"]')).toHaveCount(2);
 const withBoth=await canvasBitmap(page);
 const[r0]=await pixel(page,72,64); // inside filter 0's plateau
 expect(r0).toBeGreaterThan(180);
 await page.getByTestId('photos-rad-marker-0').click(); // delete the left filter
 await page.waitForTimeout(800);
 await expect(page.locator('[data-testid="photos-rad-overlay"] [data-testid^="photos-rad-marker-"]')).toHaveCount(1);
 expect(await pixel(page,72,64)).toEqual([120,120,120,255]); // left region restored
 const[r1]=await pixel(page,168,96); // filter 1 stays
 expect(r1).toBeGreaterThan(180);
 await page.getByTestId('photos-undo').click(); // ONE undo brings it back
 await page.waitForTimeout(800);
 await expect(page.locator('[data-testid="photos-rad-overlay"] [data-testid^="photos-rad-marker-"]')).toHaveCount(2);
 expect(await canvasBitmap(page)).toEqual(withBoth);
});
test('radial filter mode renders in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-rad');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  const toggle=page.getByTestId('photos-rad');
  writeFileSync(`test-results/ds-photos-rad-canvas-${theme}.png`,Buffer.from((await canvasBitmap(page)).split(',')[1],'base64'));
  if(await toggle.count()){
   await toggle.click();
   await page.getByTestId('photos-rad-ev').fill('0.7');
   const box=await page.getByTestId('photos-canvas').boundingBox();
   await page.mouse.move(box!.x+0.35*box!.width,box!.y+0.3*box!.height);
   await page.mouse.down();
   await page.mouse.move(box!.x+0.65*box!.width,box!.y+0.7*box!.height,{steps:6});
   await page.mouse.up();
   await page.waitForTimeout(800);
   await expect(page.getByTestId('photos-rad-overlay')).toBeVisible();
  }
  await page.waitForTimeout(400);
  await page.screenshot({path:`test-results/ds-photos-rad-${theme}.png`,fullPage:true});
 }
});
test('inverted radial: the outside brightens, the centre stays, one undo step (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  const at=await ready(page);
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  const before=await canvasBitmap(page);
  const invert=page.getByTestId('photos-rad-invert');
  await expect(invert).toBeVisible();
  if(await invert.getAttribute('aria-pressed')!=='true')await invert.click(); // panel state persists across the theme loop
  await expect(invert).toHaveAttribute('aria-pressed','true');
  await page.getByTestId('photos-rad-ev').fill('0.7');
  await page.mouse.move(...at(0.35,0.3));
  await page.mouse.down();
  await page.mouse.move(...at(0.65,0.7),{steps:8});
  await page.mouse.up();
  await page.waitForTimeout(800);
  expect(await pixel(page,120,80)).toEqual([120,120,120,255]); // centre: coverage 0
  const[r]=await pixel(page,10,10);
  expect(r).toBeGreaterThan(185);expect(r).toBeLessThan(205); // corner: full 2^0.7
  await page.screenshot({path:`test-results/ds-photos-rad-invert-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-undo').click();
  await page.waitForTimeout(800);
  expect(await canvasBitmap(page)).toEqual(before);
 }
});
