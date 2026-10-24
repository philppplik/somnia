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
async function curvePoint(page:import('@playwright/test').Page,vx:number,vy:number):Promise<[number,number]>{
 const box=await page.getByTestId('photos-curves-svg').boundingBox();
 return[box!.x+vx*box!.width,box!.y+(1-vy)*box!.height];
}
async function ready(page:import('@playwright/test').Page){
 await page.goto('/test/design-system/?view=photos-curves');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await expect(page.getByTestId('photos-curves-svg')).toBeVisible();
}
test('tone curve: dragging a mid point up brightens the midtones, the endpoints stay pinned, one undo restores',async({page})=>{
 await ready(page);
 const before=await canvasBitmap(page);
 const from=await curvePoint(page,0.5,0.5);
 const to=await curvePoint(page,0.5,0.72);
 await page.mouse.move(...from);
 await page.mouse.down();
 await page.mouse.move(...to,{steps:8});
 await page.mouse.up();
 await expect(page.locator('[data-testid^="photos-curves-pt-"]')).toHaveCount(1);
 await page.waitForTimeout(800);
 const[r]=await pixel(page,120,80); // column 120 = value 128, lifted toward 0.72
 expect(r).toBeGreaterThan(170);expect(r).toBeLessThan(200);
 expect((await pixel(page,0,80))[0]).toBe(0);   // black stays black
 expect((await pixel(page,239,80))[0]).toBe(255); // white stays white
 await page.screenshot({path:'test-results/ds-photos-curves-result.png',fullPage:true});
 await page.getByTestId('photos-undo').click(); // one undo for the whole drag
 await page.waitForTimeout(800);
 expect(await canvasBitmap(page)).toEqual(before);
 await expect(page.locator('[data-testid^="photos-curves-pt-"]')).toHaveCount(0);
});
test('channel curve: pulling red down dims only red, dragging the point below the box deletes it, reset clears the curve',async({page})=>{
 await ready(page);
 await page.getByTestId('photos-curves-ch-red').click();
 const from=await curvePoint(page,0.5,0.5);
 const to=await curvePoint(page,0.5,0.25);
 await page.mouse.move(...from);
 await page.mouse.down();
 await page.mouse.move(...to,{steps:8});
 await page.mouse.up();
 await page.waitForTimeout(800);
 const[r,g]=await pixel(page,120,80);
 expect(g).toBe(128);           // green untouched
 expect(r).toBeGreaterThan(40);expect(r).toBeLessThan(90); // red pulled toward 0.25
 const box=await page.getByTestId('photos-curves-svg').boundingBox();
 await page.mouse.move(...to);
 await page.mouse.down();
 await page.mouse.move(to[0],box!.y+box!.height+40,{steps:4}); // below the box deletes
 await page.mouse.up();
 await expect(page.locator('[data-testid^="photos-curves-pt-"]')).toHaveCount(0);
 await page.waitForTimeout(800);
 expect((await pixel(page,120,80))[0]).toBe(128); // red restored
 // reset clears a committed curve
 const f2=await curvePoint(page,0.5,0.5);
 const t2=await curvePoint(page,0.5,0.8);
 await page.mouse.move(...f2);await page.mouse.down();await page.mouse.move(...t2,{steps:6});await page.mouse.up();
 await page.waitForTimeout(800);
 await expect(page.locator('[data-testid^="photos-curves-pt-"]')).toHaveCount(1);
 await page.getByTestId('photos-curves-reset').click();
 await expect(page.locator('[data-testid^="photos-curves-pt-"]')).toHaveCount(0);
});
test('tone curves render in light and dark (parity captures the pristine gray canvas)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-curves&gray');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  writeFileSync(`test-results/ds-photos-curves-canvas-${theme}.png`,Buffer.from((await canvasBitmap(page)).split(',')[1],'base64'));
  // now show an S curve on the gradient for the visual shot
  await page.goto('/test/design-system/?view=photos-curves');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-curves-svg')).toBeVisible();
  for(const[vx,vy]of[[0.3,0.18],[0.7,0.85]]){
   const pt=await curvePoint(page,vx,vy);
   await page.mouse.move(...pt);await page.mouse.down();await page.mouse.up(); // a click adds and commits one point
  }
  await page.waitForTimeout(800);
  await page.screenshot({path:`test-results/ds-photos-curves-${theme}.png`,fullPage:true});
 }
});
