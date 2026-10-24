import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
test.use({viewport:{width:1200,height:900}});
async function canvasBitmap(page:import('@playwright/test').Page){
 return page.evaluate(()=>(document.querySelector('[data-testid="photos-canvas"]') as HTMLCanvasElement).toDataURL('image/png'));
}
async function pixel(page:import('@playwright/test').Page,nx:number,ny:number){
 return page.evaluate(([x,y])=>{const c=document.querySelector('[data-testid="photos-canvas"]') as HTMLCanvasElement;return[...c.getContext('2d')!.getImageData(Math.round(x*(c.width-1)),Math.round(y*(c.height-1)),1,1).data].slice(0,3);},[nx,ny]);
}
async function stageBox(page:import('@playwright/test').Page){
 const c=await page.getByTestId('photos-canvas').boundingBox();return c!;
}
async function stroke(page:import('@playwright/test').Page,nx:number,ny:number){
 const b=await stageBox(page);
 await page.mouse.move(b.x+nx*b.width,b.y+ny*b.height);
 await page.mouse.down();
 await page.mouse.move(b.x+(nx+0.08)*b.width,b.y+ny*b.height,{steps:6});
 await page.mouse.up();
 await page.waitForTimeout(700); // source re-encode + engine reload
}
test('brush: stroke brightens only the painted region, one undo per stroke, marker deletes',async({page})=>{
 await page.goto('/test/design-system/?view=photos-brush');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 const pristine=await canvasBitmap(page);
 expect(await pixel(page,0.3,0.5)).toEqual([128,128,128]);
 await page.getByTestId('photos-brush').click();
 await expect(page.getByTestId('photos-brush')).toHaveAttribute('aria-pressed','true');
 await page.getByTestId('photos-brush-ev').fill('1');
 await stroke(page,0.3,0.5);
 const [r,g,b]=await pixel(page,0.3,0.5);
 expect(r).toBeGreaterThan(200); // ev +1 doubles 128
 expect(await pixel(page,0.8,0.5)).toEqual([128,128,128]); // outside untouched
 await expect(page.getByTestId('photos-brush-overlay')).toBeVisible();
 await expect(page.getByTestId('photos-brush-marker-0')).toBeVisible();
 // one undo per stroke
 await page.getByTestId('photos-undo').click();
 await page.waitForTimeout(700);
 expect(await canvasBitmap(page)).toEqual(pristine);
 // redo, then delete the stroke through its overlay marker (also one undo step)
 await page.getByTestId('photos-redo').click();
 await page.waitForTimeout(700);
 await page.getByTestId('photos-brush-marker-0').click();
 await page.waitForTimeout(700);
 expect(await canvasBitmap(page)).toEqual(pristine);
 await page.getByTestId('photos-undo').click(); // undo the delete: stroke returns
 await page.waitForTimeout(700);
 const [r2]=await pixel(page,0.3,0.5);
 expect(r2).toBeGreaterThan(200);
 // Escape disarms the mode
 await page.keyboard.press('Escape');
 await expect(page.getByTestId('photos-brush')).toHaveAttribute('aria-pressed','false');
});
test('brush: per-stroke values freeze, temperature warms the patch',async({page})=>{
 await page.goto('/test/design-system/?view=photos-brush');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await page.getByTestId('photos-brush').click();
 await page.getByTestId('photos-brush-ev').fill('0');
 await page.getByTestId('photos-brush-temp').fill('80');
 await stroke(page,0.3,0.5);
 const [r,g,b]=await pixel(page,0.3,0.5);
 expect(r).toBeGreaterThan(g);expect(g).toBeGreaterThan(b); // warm shift, brightness ~unchanged
 expect(Math.abs(r-128)).toBeLessThan(60);
 await page.getByTestId('photos-brush-temp').fill('0');
 await page.getByTestId('photos-brush-ev').fill('-1');
 await stroke(page,0.7,0.5);
 const [r2,g2,b2]=await pixel(page,0.7,0.5);
 expect(r2).toBeLessThan(80); // darkened patch, neutral hue
 expect(Math.abs(r2-b2)).toBeLessThan(8);
 const [rw]=await pixel(page,0.3,0.5); // first stroke keeps its own warm values
 expect(rw).toBeGreaterThan(g2);
});
test('brush mode renders in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-brush');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await page.getByTestId('photos-brush').click();
  await page.getByTestId('photos-brush-ev').fill('1');
  await stroke(page,0.3,0.5);
  await expect(page.getByTestId('photos-brush-overlay')).toBeVisible();
  await page.screenshot({path:`test-results/ds-photos-brush-${theme}.png`,fullPage:true});
 }
});
