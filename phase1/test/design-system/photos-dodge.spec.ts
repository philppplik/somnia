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
async function dabAtCenter(page:import('@playwright/test').Page){
 await page.goto('/test/design-system/?view=photos-dodge');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 const before=await canvasBitmap(page);
 await page.getByTestId('photos-dodge').click();
 const box=await page.getByTestId('photos-canvas').boundingBox();
 return{before,click:async()=>page.mouse.click(box!.x+0.5*box!.width,box!.y+0.5*box!.height)};
}
test('dodge/burn: a dab with +0.7 EV brightens the masked disc, undo restores',async({page})=>{
 const{before,click}=await dabAtCenter(page);
 expect(await pixel(page,120,80)).toEqual([100,140,90,255]);
 await page.getByTestId('photos-dodge-amount').fill('0.7');
 await click();
 await page.waitForTimeout(800);
 const[r,g,b]=await pixel(page,120,80);
 expect(r).toBeGreaterThan(155);expect(r).toBeLessThan(170); // 100*2^0.7
 expect(g).toBeGreaterThan(220);expect(g).toBeLessThan(235);
 expect(b).toBeGreaterThan(138);expect(b).toBeLessThan(153);
 expect(await pixel(page,20,20)).toEqual([100,140,90,255]); // outside the mask untouched
 await page.getByTestId('photos-undo').click();
 await page.waitForTimeout(800);
 expect(await canvasBitmap(page)).toEqual(before);
});
test('dodge/burn: -100 saturation greys the masked disc',async({page})=>{
 const{before,click}=await dabAtCenter(page);
 await page.getByTestId('photos-dodge-sat').fill('-100');
 await click();
 await page.waitForTimeout(800);
 const[r,g,b]=await pixel(page,120,80);
 expect(Math.abs(r-g)).toBeLessThanOrEqual(2);
 expect(Math.abs(g-b)).toBeLessThanOrEqual(2);
 expect(r).toBeGreaterThan(120);expect(r).toBeLessThan(136); // luma of (100,140,90)
 await page.getByTestId('photos-undo').click();
 await page.waitForTimeout(800);
 expect(await canvasBitmap(page)).toEqual(before);
});
test('dodge/burn mode renders in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-dodge');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  const toggle=page.getByTestId('photos-dodge');
  if(await toggle.count()){
   await toggle.click();
   await expect(toggle).toHaveAttribute('aria-pressed','true');
   const box=await page.getByTestId('photos-canvas').boundingBox();
   await page.mouse.move(box!.x+0.5*box!.width,box!.y+0.5*box!.height);
   await expect(page.getByTestId('photos-heal-cursor')).toBeVisible();
  }
  await page.waitForTimeout(500);
  await page.screenshot({path:`test-results/ds-photos-dodge-${theme}.png`,fullPage:true});
  writeFileSync(`test-results/ds-photos-dodge-canvas-${theme}.png`,Buffer.from((await canvasBitmap(page)).split(',')[1],'base64'));
 }
});
