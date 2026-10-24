import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
test.use({viewport:{width:760,height:900}});
async function canvasBitmap(page:import('@playwright/test').Page){
 return page.evaluate(()=>(document.querySelector('[data-testid="photos-canvas"]') as HTMLCanvasElement).toDataURL('image/png'));
}
test('workspace bar wraps: every control stays inside the viewport at 760px',async({page})=>{
 await page.goto('/test/design-system/?view=photos-dodge');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await page.getByTestId('photos-dodge').click(); // maximal control count: toggle + three sliders
 const bar=page.locator('[data-testid="photos-workspace"] > .media-bar');
 const overflow=await bar.evaluate(el=>el.scrollWidth-el.clientWidth);
 expect(overflow).toBeLessThanOrEqual(2);
 for(const id of['photos-export-png','photos-export-jpeg','photos-dodge','photos-heal','photos-crop','photos-dodge-amount','photos-dodge-sat']){
  const box=await page.getByTestId(id).boundingBox();
  expect(box,`${id} reachable`).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x+box!.width).toBeLessThanOrEqual(762);
 }
 await page.screenshot({path:'test-results/ds-photos-toolbar-wrap.png',fullPage:true});
});
test('workspace bar renders in light and dark at 760px',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-dodge');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  const toggle=page.getByTestId('photos-dodge');
  if(await toggle.count())await toggle.click();
  await page.waitForTimeout(500);
  await page.screenshot({path:`test-results/ds-photos-toolbar-${theme}.png`,fullPage:true});
  writeFileSync(`test-results/ds-photos-toolbar-canvas-${theme}.png`,Buffer.from((await canvasBitmap(page)).split(',')[1],'base64'));
 }
});
