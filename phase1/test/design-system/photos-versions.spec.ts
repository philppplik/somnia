import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
test.use({viewport:{width:1400,height:900}});
async function canvasBitmap(page:import('@playwright/test').Page){
 return page.evaluate(()=>(document.querySelector('[data-testid="photos-canvas"]') as HTMLCanvasElement).toDataURL('image/png'));
}
async function warmPixel(page:import('@playwright/test').Page){
 return page.evaluate(()=>{const c=document.querySelector('[data-testid="photos-canvas"]') as HTMLCanvasElement;return[...c.getContext('2d')!.getImageData(2,2,1,1).data].slice(0,3);});
}
async function saveVersion(page:import('@playwright/test').Page,name:string){
 await page.getByTestId('photos-version-name').fill(name);
 await page.getByTestId('photos-version-save').click();
}
test('versions: save, non-linear apply as one undo, current marker, delete',async({page})=>{
 await page.goto('/test/design-system/?view=photos-versions');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await expect(page.getByTestId('photos-history-panel')).toBeVisible();
 await expect(page.getByTestId('photos-versions-none')).toBeVisible();
 // state A: commit a warm exposure through the same session API the workspace gestures use
 await page.evaluate(async()=>{
  const mod=await import('/src/lib/photos/studioSession.ts');
  mod.commitPhotoSettings('versions-proof.png',(s:{exposure:number})=>({...s,exposure:1.2}));
 });
 await page.waitForTimeout(700);
 let [r,,b]=await warmPixel(page);expect(r).toBeGreaterThan(190);expect(b).toBeLessThan(90); // warm
 const warm=await canvasBitmap(page);
 await saveVersion(page,'Warm look');
 await expect(page.getByTestId('photos-versions-none')).toHaveCount(0);
 await expect(page.getByTestId('photos-versions-count')).toHaveText('1/20');
 // jump history back to "opened" (cool), save that as a second version
 await page.getByTestId('photos-history-0').click();
 await page.waitForTimeout(700);
 ;[r,,b]=await warmPixel(page);expect(b).toBeGreaterThan(190); // cool
 await saveVersion(page,'Cool start');
 await expect(page.getByTestId('photos-versions-count')).toHaveText('2/20');
 // editing after the jump clears the redo future, but the warm VERSION survives: apply it non-linearly
 await page.getByTestId('photos-version-save'); // form still there
 const warmBtn=page.locator('[data-testid^="photos-version-"]:not([data-testid*="delete"]):not([data-testid="photos-version-save"]):not([data-testid="photos-version-name"])',{hasText:'Warm look'});
 await warmBtn.click();
 await page.waitForTimeout(700);
 ;[r,,b]=await warmPixel(page);expect(r).toBeGreaterThan(190);expect(b).toBeLessThan(90); // warm again
 expect(await canvasBitmap(page)).toEqual(warm);
 await expect(warmBtn).toHaveAttribute('aria-current','step');
 // the apply was ONE undo step
 await page.getByTestId('photos-undo').click();
 await page.waitForTimeout(700);
 ;[r,,b]=await warmPixel(page);expect(b).toBeGreaterThan(190); // back to cool
 // delete the cool version
 await page.locator('[data-testid^="photos-version-delete-"]').first().click();
 await expect(page.getByTestId('photos-versions-count')).toHaveText('1/20');
});
test('split polish: divider persists across reload, double-click centers, Escape disarms',async({page})=>{
 await page.goto('/test/design-system/?view=photos-versions');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 const toggle=page.getByTestId('photos-split');
 if(await toggle.getAttribute('aria-pressed')!=='true')await toggle.click();
 await expect(page.getByTestId('photos-split-canvas')).toBeVisible();
 const box=await page.getByTestId('photos-split-divider').boundingBox();
 await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);
 await page.mouse.down();
 await page.mouse.move(box!.x+box!.width/4,box!.y+box!.height/2,{steps:5});
 await page.mouse.up();
 const moved=Number(await page.getByTestId('photos-split-handle').getAttribute('x1'));
 const width=box!.width;
 expect(moved).toBeLessThan(width/2);
 await page.reload();
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await expect(page.getByTestId('photos-split')).toHaveAttribute('aria-pressed','true'); // toggle persisted already
 await expect(page.getByTestId('photos-split-canvas')).toBeVisible();
 const kept=Number(await page.getByTestId('photos-split-handle').getAttribute('x1'));
 expect(Math.abs(kept-moved)).toBeLessThan(3); // position persisted too (P56)
 await page.getByTestId('photos-split-handle').dispatchEvent('dblclick');
 const centered=Number(await page.getByTestId('photos-split-handle').getAttribute('x1'));
 expect(Math.abs(centered-width/2)).toBeLessThan(6);
 await page.keyboard.press('Escape');
 await expect(page.getByTestId('photos-split-canvas')).toHaveCount(0);
 await expect(page.getByTestId('photos-split')).toHaveAttribute('aria-pressed','false');
});
test('versions view renders in light and dark, pristine stage parity captures',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-versions');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-history-panel')).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({path:`test-results/ds-photos-versions-${theme}.png`,fullPage:true});
  writeFileSync(`test-results/ds-photos-versions-canvas-${theme}.png`,Buffer.from((await canvasBitmap(page)).split(',')[1],'base64'));
 }
});
