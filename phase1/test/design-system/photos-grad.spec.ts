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
 await page.goto('/test/design-system/?view=photos-grad');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await page.getByTestId('photos-grad').click();
 await expect(page.getByTestId('photos-grad')).toHaveAttribute('aria-pressed','true');
 const box=await page.getByTestId('photos-canvas').boundingBox();
 return(nx:number,ny:number):[number,number]=>[box!.x+nx*box!.width,box!.y+ny*box!.height];
}
test('graduated filter: a drag darkens the sky along the ramp, the field stays untouched, undo restores',async({page})=>{
 const at=await ready(page);
 const before=await canvasBitmap(page);
 await page.getByTestId('photos-grad-ev').fill('-0.7');
 await page.mouse.move(...at(0.5,0.05));
 await page.mouse.down();
 await page.mouse.move(...at(0.5,0.5),{steps:8}); // ramp from the sky top to the horizon
 await expect(page.getByTestId('photos-grad-overlay')).toBeVisible(); // in-flight draft shows
 await page.mouse.up();
 await page.waitForTimeout(800);
 const[r,g,b]=await pixel(page,120,16); // high sky: nearly full strength *2^-0.7
 expect(r).toBeGreaterThan(60);expect(r).toBeLessThan(100); // 120*0.62
 expect(g).toBeGreaterThan(90);expect(g).toBeLessThan(130);
 expect(b).toBeGreaterThan(120);expect(b).toBeLessThan(165);
 expect(await pixel(page,120,140)).toEqual([60,140,80,255]); // the field is beyond the end plane
 await expect(page.locator('[data-testid="photos-grad-overlay"] line')).toHaveCount(3);
 await page.screenshot({path:'test-results/ds-photos-grad-result.png',fullPage:true});
 await page.getByTestId('photos-undo').click();
 await page.waitForTimeout(800);
 expect(await canvasBitmap(page)).toEqual(before);
});
test('gradient markers: clicking the handle deletes exactly that filter as one undo step',async({page})=>{
 const at=await ready(page);
 await page.getByTestId('photos-grad-ev').fill('-0.7');
 await page.mouse.move(...at(0.5,0.05));await page.mouse.down();
 await page.mouse.move(...at(0.5,0.5),{steps:6});await page.mouse.up(); // filter 0 over the sky
 await page.waitForTimeout(800);
 await page.mouse.move(...at(0.3,0.7));await page.mouse.down();
 await page.mouse.move(...at(0.3,0.95),{steps:4});await page.mouse.up(); // filter 1 over the field
 await page.waitForTimeout(800);
 await expect(page.locator('[data-testid="photos-grad-overlay"] [data-testid^="photos-grad-marker-"]')).toHaveCount(2);
 const withBoth=await canvasBitmap(page);
 const[fr]=await pixel(page,72,128); // inside filter 1's plateau
 expect(fr).toBeLessThan(55); // 60*2^-0.7 darkened
 await page.getByTestId('photos-grad-marker-1').click(); // delete the field filter
 await page.waitForTimeout(800);
 await expect(page.locator('[data-testid="photos-grad-overlay"] [data-testid^="photos-grad-marker-"]')).toHaveCount(1);
 expect(await pixel(page,72,128)).toEqual([60,140,80,255]); // field restored
 const[sr]=await pixel(page,120,16);
 expect(sr).toBeLessThan(100); // the sky filter stays
 await page.getByTestId('photos-undo').click(); // ONE undo brings the field filter back
 await page.waitForTimeout(800);
 await expect(page.locator('[data-testid="photos-grad-overlay"] [data-testid^="photos-grad-marker-"]')).toHaveCount(2);
 expect(await canvasBitmap(page)).toEqual(withBoth);
});
test('graduated filter mode renders in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-grad');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  const toggle=page.getByTestId('photos-grad');
  writeFileSync(`test-results/ds-photos-grad-canvas-${theme}.png`,Buffer.from((await canvasBitmap(page)).split(',')[1],'base64'));
  if(await toggle.count()){
   await toggle.click();
   await page.getByTestId('photos-grad-ev').fill('-0.7');
   const box=await page.getByTestId('photos-canvas').boundingBox();
   await page.mouse.move(box!.x+0.5*box!.width,box!.y+0.05*box!.height);
   await page.mouse.down();
   await page.mouse.move(box!.x+0.5*box!.width,box!.y+0.5*box!.height,{steps:6});
   await page.mouse.up();
   await page.waitForTimeout(800);
   await expect(page.getByTestId('photos-grad-overlay')).toBeVisible();
  }
  await page.waitForTimeout(400);
  await page.screenshot({path:`test-results/ds-photos-grad-${theme}.png`,fullPage:true});
 }
});
