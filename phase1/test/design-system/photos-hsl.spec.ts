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
async function setSlider(page:import('@playwright/test').Page,testid:string,fraction:number){ // 0 = min, 1 = max: a real thumb drag, one gesture
 const el=page.getByTestId(testid);const box=await el.boundingBox();
 const y=box!.y+box!.height/2;
 await page.mouse.move(box!.x+box!.width/2,y);
 await page.mouse.down();
 await page.mouse.move(box!.x+box!.width*fraction+(fraction>=1?24:0),y,{steps:6}); // past the edge clamps to max
 await page.mouse.up();
}
async function ready(page:import('@playwright/test').Page){
 await page.goto('/test/design-system/?view=photos-hsl');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await expect(page.getByTestId('photos-hsl-panel')).toBeVisible();
}
test('color mixer: boosting red saturation saturates the red columns only, one undo restores',async({page})=>{
 await ready(page);
 const before=await canvasBitmap(page);
 const beforeRed=await pixel(page,0,80);   // hue 0
 const beforeGreen=await pixel(page,80,80); // hue ~120
 await setSlider(page,'photos-hsl-slider-sat',1); // +100
 await page.waitForTimeout(800);
 const[r,g,b]=await pixel(page,0,80);
 expect(r).toBe(255);expect(g).toBe(0);expect(b).toBe(0); // muted red -> full red
 expect(beforeRed[0]).toBeLessThan(255); // sanity: it started muted
 expect(await pixel(page,80,80)).toEqual(beforeGreen); // green untouched
 await expect(page.getByTestId('photos-hsl-value-sat')).toHaveText('+100');
 await page.screenshot({path:'test-results/ds-photos-hsl-result.png',fullPage:true});
 await page.getByTestId('photos-undo').click(); // one undo for the whole drag
 await page.waitForTimeout(800);
 expect(await canvasBitmap(page)).toEqual(before);
});
test('color mixer: shifting red hue moves red toward yellow, aqua stays untouched, band reset clears',async({page})=>{
 await ready(page);
 const beforeAqua=await pixel(page,120,80); // hue ~180
 await setSlider(page,'photos-hsl-slider-hue',1); // +100 = +60 degrees
 await expect(page.getByTestId('photos-hsl-value-hue')).toHaveText('+100');
 await page.waitForTimeout(800);
 const[r,g,b]=await pixel(page,0,80);
 expect(r).toBeGreaterThan(195);expect(g).toBeGreaterThan(195);expect(b).toBeGreaterThan(40);expect(b).toBeLessThan(60); // muted red -> muted yellow (60 deg): r=g=204, b=51 (l=0.5 floor)
 expect(await pixel(page,120,80)).toEqual(beforeAqua); // aqua untouched by the red band
 await page.getByTestId('photos-hsl-reset').click();
 await page.waitForTimeout(800);
 await expect(page.getByTestId('photos-hsl-value-hue')).toHaveText('0');
 const[r2,g2,b2]=await pixel(page,0,80);
 expect(r2).toBeGreaterThan(200);expect(g2).toBeLessThan(120); // back to the muted red of the sweep
 expect(b2).toBeLessThan(120);
});
test('color mixer renders in light and dark (parity captures the pristine gray canvas)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-hsl&gray');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  writeFileSync(`test-results/ds-photos-hsl-canvas-${theme}.png`,Buffer.from((await canvasBitmap(page)).split(',')[1],'base64'));
  await page.goto('/test/design-system/?view=photos-hsl');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-hsl-panel')).toBeVisible();
  await page.getByTestId('photos-hsl-band-green').click();
  await setSlider(page,'photos-hsl-slider-lum',0.8);
  await setSlider(page,'photos-hsl-slider-sat',0.9);
  await page.waitForTimeout(800);
  await page.screenshot({path:`test-results/ds-photos-hsl-${theme}.png`,fullPage:true});
 }
});
