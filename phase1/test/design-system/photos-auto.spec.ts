import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
test.use({viewport:{width:1400,height:900}});
async function canvasBitmap(page:import('@playwright/test').Page){
 return page.evaluate(()=>(document.querySelector('[data-testid="photos-canvas"]') as HTMLCanvasElement).toDataURL('image/png'));
}
async function value(page:import('@playwright/test').Page,testid:string){
 return page.getByTestId(testid).textContent();
}
test('auto tone derives the light settings from the frame as one undo step',async({page})=>{
 await page.goto('/test/design-system/?view=photos-auto');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await expect(page.getByTestId('photos-light-panel')).toBeVisible();
 await page.getByTestId('photos-light-auto').click();
 await page.waitForTimeout(500);
 // Dark warm gradient (range 40..180): exposure lifts toward mid gray, blacks deepen, whites lift.
 const exposure=await value(page,'photos-value-exposure');
 const whites=await value(page,'photos-value-whites');
 const blacks=await value(page,'photos-value-blacks');
 expect(Number(exposure)).toBeGreaterThan(0.05);expect(Number(exposure)).toBeLessThan(0.5); // midpoint 118 -> ~+0.12
 expect(Number(whites)).toBeGreaterThan(10);
 expect(Number(blacks)).toBeLessThan(0);
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await page.waitForTimeout(400);
 expect(Number(await value(page,'photos-value-exposure'))).toBe(0); // one undo restores all five picks
 expect(Number(await value(page,'photos-value-whites'))).toBe(0);
});
test('auto white balance cools the warm cast as one undo step',async({page})=>{
 await page.goto('/test/design-system/?view=photos-auto');
 await expect(page.getByTestId('photos-color-panel')).toBeVisible();
 expect(await value(page,'photos-value-temp')).toBe('6500 K');
 await page.getByTestId('photos-color-auto').click();
 await page.waitForTimeout(500);
 const temp=Number(String(await value(page,'photos-value-temp')).replace(/[^0-9]/g,''));
 expect(temp).toBeGreaterThan(6500); // warm cast -> cooler setting
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await page.waitForTimeout(400);
 expect(await value(page,'photos-value-temp')).toBe('6500 K');
});
test('auto buttons render in light and dark (parity captures the pristine gray canvas)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-auto&gray');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  writeFileSync(`test-results/ds-photos-auto-canvas-${theme}.png`,Buffer.from((await canvasBitmap(page)).split(',')[1],'base64'));
  await page.goto('/test/design-system/?view=photos-auto');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-light-panel')).toBeVisible();
  await page.getByTestId('photos-light-auto').click();
  await page.waitForTimeout(500);
  await page.screenshot({path:`test-results/ds-photos-auto-${theme}.png`,fullPage:true});
 }
});
test('white balance picker: clicking the frame picks temp and tint as one undo step and disarms',async({page})=>{
 await page.goto('/test/design-system/?view=photos-auto');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await expect(page.getByTestId('photos-color-panel')).toBeVisible();
 expect(await value(page,'photos-value-temp')).toBe('6500 K');
 const picker=page.getByTestId('photos-color-wb-picker');
 await picker.click();
 await expect(picker).toHaveAttribute('aria-pressed','true');
 const box=await page.getByTestId('photos-canvas').boundingBox();
 await page.mouse.click(box!.x+0.5*box!.width,box!.y+0.5*box!.height); // pick the warm gradient mid
 await page.waitForTimeout(500);
 await expect(picker).toHaveAttribute('aria-pressed','false'); // disarmed after the pick
 const temp=Number(String(await value(page,'photos-value-temp')).replace(/[^0-9]/g,''));
 expect(temp).toBeGreaterThan(6500); // warm patch -> cooler setting
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await page.waitForTimeout(400);
 expect(await value(page,'photos-value-temp')).toBe('6500 K'); // one undo restores the pick
});
test('white balance picker renders in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-auto');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await page.getByTestId('photos-color-wb-picker').click();
  const box=await page.getByTestId('photos-canvas').boundingBox();
  await page.mouse.click(box!.x+0.5*box!.width,box!.y+0.5*box!.height);
  await page.waitForTimeout(500);
  const temp=Number(String(await value(page,'photos-value-temp')).replace(/[^0-9]/g,''));
  expect(temp).toBeGreaterThan(6500);
  await page.screenshot({path:`test-results/ds-photos-wb-picker-${theme}.png`,fullPage:true});
 }
});
test('white-balance presets set temp+tint as one undo step (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-auto');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-color-panel')).toBeVisible();
  const picker=page.getByTestId('photos-wb-preset');
  await expect(picker).toBeVisible();
  await expect(picker).toHaveValue(''); // 6500/0 sits on no preset
  await picker.selectOption('tungsten');
  await expect(page.getByTestId('photos-value-temp')).toHaveText('2850 K');
  await expect(page.getByTestId('photos-value-tint')).toHaveText('0');
  await expect(picker).toHaveValue('tungsten'); // the pair matches the preset
  await page.screenshot({path:`test-results/ds-photos-wb-preset-${theme}.png`,fullPage:true});
  await picker.selectOption('shade');
  await expect(page.getByTestId('photos-value-temp')).toHaveText('7500 K');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await page.waitForTimeout(400);
  await expect(page.getByTestId('photos-value-temp')).toHaveText('2850 K'); // one undo step for the pair
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await page.waitForTimeout(400);
  await expect(page.getByTestId('photos-value-temp')).toHaveText('6500 K');
 }
});
