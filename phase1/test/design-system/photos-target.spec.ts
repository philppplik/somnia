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
async function at(page:import('@playwright/test').Page){
 const box=await page.getByTestId('photos-canvas').boundingBox();
 return(nx:number,ny:number):[number,number]=>[box!.x+nx*box!.width,box!.y+ny*box!.height];
}
test('curve targeting: arming the curves panel and dragging up on the photo brightens that tone, one undo restores',async({page})=>{
 await page.goto('/test/design-system/?view=photos-curves');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await page.getByTestId('photos-curves-target').click();
 await expect(page.getByTestId('photos-curves-target')).toHaveAttribute('aria-pressed','true');
 const pos=await at(page);
 const before=await canvasBitmap(page);
 await page.mouse.move(...pos(0.5,0.5));
 await page.mouse.down();
 await page.mouse.move(...pos(0.5,0.15),{steps:8}); // drag up = brighten this tone
 await page.mouse.up();
 await expect(page.locator('[data-testid^="photos-curves-pt-"]')).toHaveCount(1); // the point landed in the panel
 await page.waitForTimeout(800);
 const[r]=await pixel(page,120,80);
 expect(r).toBeGreaterThan(140); // column 120 (tone 128) lifted
 expect((await pixel(page,0,80))[0]).toBe(0); // endpoints still pinned
 await page.screenshot({path:'test-results/ds-photos-target-curves.png',fullPage:true});
 await page.getByTestId('photos-undo').click(); // one undo for the whole targeted drag
 await page.waitForTimeout(800);
 expect(await canvasBitmap(page)).toEqual(before);
});
test('mixer targeting: dragging down on a green area selects the green band and lowers its saturation, one undo restores',async({page})=>{
 await page.goto('/test/design-system/?view=photos-hsl');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await page.getByTestId('photos-hsl-target').click();
 await expect(page.getByTestId('photos-hsl-target')).toHaveAttribute('aria-pressed','true');
 const pos=await at(page);
 const before=await canvasBitmap(page);
 const[br,bg]=await pixel(page,80,80); // hue ~120
 await page.mouse.move(...pos(1/3,0.5));
 await page.mouse.down();
 await page.mouse.move(...pos(1/3,0.85),{steps:8}); // drag down = desaturate
 await page.mouse.up();
 await expect(page.getByTestId('photos-hsl-band-green')).toHaveAttribute('aria-pressed','true'); // the band got selected
 await expect(page.getByTestId('photos-hsl-value-sat')).toHaveText(/-\d+/);
 await page.waitForTimeout(800);
 const[r,g]=await pixel(page,80,80);
 expect(g-r).toBeLessThan(bg-br); // green pulled toward gray
 expect(g).toBeGreaterThan(r);    // still green
 await page.screenshot({path:'test-results/ds-photos-target-hsl.png',fullPage:true});
 await page.getByTestId('photos-undo').click();
 await page.waitForTimeout(800);
 expect(await canvasBitmap(page)).toEqual(before);
});
test('targeting renders in light and dark (parity captures the pristine gray canvas)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-curves&gray');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  writeFileSync(`test-results/ds-photos-target-canvas-${theme}.png`,Buffer.from((await canvasBitmap(page)).split(',')[1],'base64'));
  await page.getByTestId('photos-curves-target').click();
  await page.waitForTimeout(300);
  await page.screenshot({path:`test-results/ds-photos-target-${theme}.png`,fullPage:true});
 }
});
