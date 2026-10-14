import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
test.use({viewport:{width:1400,height:900}});
const NAMES=['sync-1.png','sync-2.png','sync-3.png'];
// frameOf hues at pixel (0,0) before and after contrast 18 (x1.18)
const BASE=[[40,50,140],[60,80,160],[150,90,60]];
const SYNCED=[[47,59,165],[71,94,189],[177,106,71]];
async function canvasBitmap(page:import('@playwright/test').Page){
 return page.evaluate(()=>(document.querySelector('[data-testid="photos-canvas"]') as HTMLCanvasElement).toDataURL('image/png'));
}
async function pixel0(page:import('@playwright/test').Page){
 return page.evaluate(()=>{const c=document.querySelector('[data-testid="photos-canvas"]') as HTMLCanvasElement;return[...c.getContext('2d')!.getImageData(0,0,1,1).data].slice(0,3);});
}
async function openVia(page:import('@playwright/test').Page,name:string){
 await page.getByTestId(`photos-filmstrip-item-${name}`).click();
 await page.waitForTimeout(700);
}
test('preset sync applies a look to every photo in the library, one undo step each',async({page})=>{
 await page.goto('/test/design-system/?view=photos-presets');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await expect(page.getByTestId('photos-preset-sync-vivid')).toBeVisible();
 const base:Record<string,string>={};
 for(let i=0;i<3;i++){await openVia(page,NAMES[i]);base[NAMES[i]]=await canvasBitmap(page);
  const[r,g,b]=await pixel0(page);expect([r,g,b]).toEqual(BASE[i]);}
 await page.getByTestId('photos-preset-sync-vivid').click();
 await expect(page.getByTestId('photos-presets-sync-status')).toContainText('Preset sync: 3 applied, 0 failed');
 for(let i=0;i<3;i++){
  await openVia(page,NAMES[i]);
  expect(await canvasBitmap(page)).not.toEqual(base[NAMES[i]]);
  const[r,g,b]=await pixel0(page);
  expect(Math.abs(r-SYNCED[i][0])).toBeLessThanOrEqual(3);
  expect(Math.abs(g-SYNCED[i][1])).toBeLessThanOrEqual(3);
  expect(Math.abs(b-SYNCED[i][2])).toBeLessThanOrEqual(3);
 }
 await page.getByTestId('photos-undo').click(); // active photo only: one commit per photo
 await page.waitForTimeout(700);
 expect(await canvasBitmap(page)).toEqual(base['sync-3.png']);
 await openVia(page,NAMES[0]);
 expect(await canvasBitmap(page)).not.toEqual(base['sync-1.png']); // the others keep the look
});
test('preset sync renders in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-presets');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await page.waitForTimeout(500);
  writeFileSync(`test-results/ds-photos-presets-canvas-${theme}.png`,Buffer.from((await canvasBitmap(page)).split(',')[1],'base64'));
  const syncBtn=page.getByTestId('photos-preset-sync-vivid');
  if(await syncBtn.count()){
   await syncBtn.click();
   await expect(page.getByTestId('photos-presets-sync-status')).toContainText('3 applied');
  }
  await page.waitForTimeout(300);
  await page.screenshot({path:`test-results/ds-photos-presets-${theme}.png`,fullPage:true});
 }
});
