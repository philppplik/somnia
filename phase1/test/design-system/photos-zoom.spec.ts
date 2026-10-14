import {test,expect} from '@playwright/test';
test.use({viewport:{width:1200,height:900}});
test('zoom presets jump between stops and track the active stop',async({page})=>{
 await page.goto('/test/design-system/?view=photos-zoom');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await expect(page.getByTestId('photos-zoom-fit')).toHaveAttribute('aria-pressed','true');
 for(const p of[100,200,400,50]){
  await page.getByTestId(`photos-zoom-preset-${p}`).click();
  await expect(page.getByTestId('photos-zoom-level')).toHaveText(`${p}%`);
  await expect(page.getByTestId(`photos-zoom-preset-${p}`)).toHaveAttribute('aria-pressed','true');
 }
 await page.getByTestId('photos-zoom-fit').click();
 await expect(page.getByTestId('photos-zoom-preset-100')).toHaveAttribute('aria-pressed','false');
});
test('zoom presets render in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-zoom');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await page.waitForTimeout(500);
  await page.getByTestId('photos-stage').screenshot({path:`test-results/ds-photos-zoom-stage-${theme}.png`});
  const preset=page.getByTestId('photos-zoom-preset-200');
  if(await preset.count()){await preset.click();await expect(page.getByTestId('photos-zoom-level')).toHaveText('200%');}
  await page.waitForTimeout(300);
  await page.screenshot({path:`test-results/ds-photos-zoom-${theme}.png`,fullPage:true});
 }
});
test('zoom keys: + and - step the zoom like the buttons (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-zoom');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-zoom-fit')).toHaveAttribute('aria-pressed','true');
  const level=page.getByTestId('photos-zoom-level');
  const before=parseInt(await level.innerText(),10);
  await page.keyboard.press('+');
  const zoomed=parseInt(await level.innerText(),10);
  expect(zoomed).toBeGreaterThan(before); // one 1.25x step in
  await expect(page.getByTestId('photos-zoom-fit')).toHaveAttribute('aria-pressed','false'); // explicit zoom now
  await page.screenshot({path:`test-results/ds-photos-zoom-keys-${theme}.png`,fullPage:true});
  await page.keyboard.press('-');
  await page.keyboard.press('-');
  const out=parseInt(await level.innerText(),10);
  expect(out).toBeLessThan(zoomed); // steps back out
  await page.keyboard.press('+'); // back near the start for the next leg
 }
});
test('rotate keys: [ and ] turn the photo a quarter and wrap (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-zoom');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  const orientation=()=>page.evaluate(async()=>{const mod=await import('/src/lib/photos/studioSession.ts');return mod.getPhotoSession('zoom.png')!.now.orientation;});
  await expect(page.getByTestId('photos-undo')).toBeDisabled();
  await page.keyboard.press(']');
  expect(await orientation()).toBe(1); // quarter turn right
  await expect(page.getByTestId('photos-undo')).toBeEnabled(); // a real history entry
  await page.screenshot({path:`test-results/ds-photos-rotate-keys-${theme}.png`,fullPage:true});
  await page.keyboard.press('[');
  expect(await orientation()).toBe(0); // back
  await page.keyboard.press('[');
  expect(await orientation()).toBe(3); // wraps past zero
  await page.keyboard.press(']');
  expect(await orientation()).toBe(0);
 }
});
