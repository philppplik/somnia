import {test,expect} from '@playwright/test';
test.use({viewport:{width:1400,height:900}});
async function canvasBitmap(page:import('@playwright/test').Page){
 return page.evaluate(()=>(document.querySelector('[data-testid="photos-canvas"]') as HTMLCanvasElement).toDataURL('image/png'));
}
async function pixel(page:import('@playwright/test').Page,x:number,y:number){
 return page.evaluate(([px,py])=>{const c=document.querySelector('[data-testid="photos-canvas"]') as HTMLCanvasElement;return[...c.getContext('2d')!.getImageData(px,py,1,1).data].slice(0,3);},[x,y]);
}
async function setSlider(page:import('@playwright/test').Page,key:string,value:string){
 await page.getByTestId(`photos-slider-${key}`).fill(value);
 await page.getByTestId('photos-stage').click({position:{x:8,y:8}}); // blur ends the gesture: one commit
 await page.waitForTimeout(700); // source re-encode + engine reload
}
test('vignette slider brightens corners, darkens negative, midpoint holds the center',async({page})=>{
 await page.goto('/test/design-system/?view=photos-lens');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await expect(page.getByTestId('photos-effects-panel')).toBeVisible();
 const pristine=await canvasBitmap(page);
 expect(await pixel(page,60,80)).toEqual([128,128,128]);
 await setSlider(page,'vignetteAmount','80');
 await expect(page.getByTestId('photos-value-vignetteAmount')).toHaveText('+80');
 const corner=await pixel(page,3,3);
 expect(corner[0]).toBeGreaterThan(180);
 expect(await pixel(page,200,80)).toEqual([240,240,240]); // white square interior keeps its tone
 const mid=await pixel(page,60,80);
 expect(Math.abs(mid[0]-128)).toBeLessThanOrEqual(4); // center stays put at midpoint 50
 await page.getByTestId('photos-undo').click();
 await page.waitForTimeout(700);
 expect(await canvasBitmap(page)).toEqual(pristine); // one commit = one undo
 await setSlider(page,'vignetteAmount','-60');
 const dark=await pixel(page,3,3);
 expect(dark[0]).toBeLessThan(100);
});
test('defringe slider desaturates the fringe column only at the edge',async({page})=>{
 await page.goto('/test/design-system/?view=photos-lens');
 await expect(page.getByTestId('photos-detail-panel')).toBeVisible();
 const pristine=await canvasBitmap(page);
 expect(await pixel(page,160,80)).toEqual([200,0,200]);
 await setSlider(page,'defringe','100');
 const fringe=await pixel(page,160,80);
 expect(fringe[1]).toBeGreaterThan(25); // green channel lifted toward luma
 expect(fringe[0]).toBeLessThan(160); // red pulled down: clearly desaturated
 expect(await pixel(page,29,25)).toEqual([180,0,180]); // flat purple interior untouched (no gradient)
 const edge=await pixel(page,165,80); // white near the edge, not fringe hue
 expect(edge).toEqual([240,240,240]);
 await page.getByTestId('photos-undo').click();
 await page.waitForTimeout(700);
 expect(await canvasBitmap(page)).toEqual(pristine);
});
test('lens correction renders in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-lens');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await setSlider(page,'vignetteAmount','80');
  await page.screenshot({path:`test-results/ds-photos-lens-${theme}.png`,fullPage:true});
 }
});
