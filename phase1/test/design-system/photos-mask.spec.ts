import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
test.use({viewport:{width:1400,height:900}});
async function canvasBitmap(page:import('@playwright/test').Page){
 return page.evaluate(()=>(document.querySelector('[data-testid="photos-canvas"]') as HTMLCanvasElement).toDataURL('image/png'));
}
async function pixel(page:import('@playwright/test').Page,x:number,y:number){
 return page.evaluate(([px,py])=>{const c=document.querySelector('[data-testid="photos-canvas"]') as HTMLCanvasElement;return[...c.getContext('2d')!.getImageData(px,py,1,1).data].slice(0,3);},[x,y]);
}
async function setSlider(page:import('@playwright/test').Page,key:string,value:string){
 await page.getByTestId(`photos-mask-slider-${key}`).fill(value);
 await page.getByTestId('photos-stage').click({position:{x:8,y:8}}); // blur ends the gesture: one commit
 await page.waitForTimeout(700); // source re-encode + engine reload
}
test('shadow zone plus ev brightens only the dark quadrants',async({page})=>{
 await page.goto('/test/design-system/?view=photos-mask');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await expect(page.getByTestId('photos-mask-panel')).toBeVisible();
 expect(await pixel(page,60,40)).toEqual([32,32,32]);
 expect(await pixel(page,180,120)).toEqual([255,255,255]);
 await page.getByTestId('photos-mask-zone-shadows').click();
 await setSlider(page,'ev','1');
 const[tl,tr,br,red]=await Promise.all([pixel(page,60,40),pixel(page,180,40),pixel(page,180,120),pixel(page,214,134)]);
 expect(tl[0]).toBeGreaterThan(50);         // near-black doubled through the window (32 -> ~64)
 expect(br[0]).toBeGreaterThan(240);        // white outside the window, untouched
 expect(tr[0]).toBeGreaterThan(120);expect(tr[0]).toBeLessThan(145); // smoothstep feather: partial lift (~131) between untouched and doubled
 expect(red[0]).toBeGreaterThan(240);       // saturated red is DARK in luma: it sits inside the shadow window and clips
 await expect(page.getByTestId('photos-mask-value-lumaHi')).toHaveText('35%');
});
test('hue window on red plus sat desaturates only the red square',async({page})=>{
 await page.goto('/test/design-system/?view=photos-mask');
 await expect(page.getByTestId('photos-mask-panel')).toBeVisible();
 await page.getByTestId('photos-mask-hue-toggle').click();
 await setSlider(page,'hueCenter','0');
 await setSlider(page,'hueRange','40');
 await setSlider(page,'lumaLo','0');
 await setSlider(page,'lumaHi','1');
 await setSlider(page,'sat','-100');
 const[red,br]=await Promise.all([pixel(page,214,134),pixel(page,180,120)]);
 expect(red[0]).toBeLessThan(180);          // red collapses toward gray
 expect(Math.abs(red[0]-red[1])).toBeLessThan(30);
 expect(br[0]).toBeGreaterThan(240);        // achromatic white never matches a hue window
});
test('overlay toggle paints the weight map, undo restores the neutral mask',async({page})=>{
 await page.goto('/test/design-system/?view=photos-mask');
 await expect(page.getByTestId('photos-mask-panel')).toBeVisible();
 await page.getByTestId('photos-mask-zone-highlights').click();
 await page.getByTestId('photos-mask-overlay-toggle').click();
 await expect(page.getByTestId('photos-lummask-overlay')).toBeVisible();
 await page.waitForTimeout(500);
 await page.screenshot({path:'test-results/ds-photos-mask-overlay.png',fullPage:true});
 await page.getByRole('button',{name:'Undo',exact:true}).click(); // photos undo has no Ctrl+z binding; the toolbar button is the real path
 await page.waitForTimeout(600);
 await expect(page.getByTestId('photos-mask-value-lumaHi')).toHaveText('100%'); // zone window truly restored
 await expect(page.getByTestId('photos-lummask-overlay')).toHaveCount(0);
});
test('mask panel renders in light and dark (parity captures the pristine gray canvas)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-mask&gray');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  writeFileSync(`test-results/ds-photos-mask-canvas-${theme}.png`,Buffer.from((await canvasBitmap(page)).split(',')[1],'base64'));
  await page.goto('/test/design-system/?view=photos-mask');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-mask-panel')).toBeVisible();
  await page.getByTestId('photos-mask-zone-midtones').click();
  await setSlider(page,'temp','50');
  await page.screenshot({path:`test-results/ds-photos-mask-${theme}.png`,fullPage:true});
 }
});
