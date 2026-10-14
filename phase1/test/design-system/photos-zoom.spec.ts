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
test('lights-out: L dims the workspace chrome, L again restores it (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-zoom');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  const ws=page.getByTestId('photos-workspace');
  await expect(ws).toBeVisible();
  if(await ws.getAttribute('class').then(c=>c!.includes('photos-lights-out')))await page.keyboard.press('l'); // normalize persisted state
  const barOpacity=()=>page.locator('[data-testid="photos-workspace"] > .media-bar').evaluate(el=>getComputedStyle(el).opacity);
  expect(await barOpacity()).toBe('1');
  await page.keyboard.press('l');
  await expect(ws).toHaveClass(/photos-lights-out/);
  await expect.poll(barOpacity).toBe('0.18'); // chrome dimmed (after the fade transition)
  const canvasOpacity=await page.getByTestId('photos-canvas').evaluate(el=>getComputedStyle(el).opacity);
  expect(canvasOpacity).toBe('1'); // the canvas stays clear
  await page.screenshot({path:`test-results/ds-photos-lights-out-${theme}.png`,fullPage:true});
  await page.keyboard.press('l');
  await expect(ws).not.toHaveClass(/photos-lights-out/);
  await expect.poll(barOpacity).toBe('1');
 }
});
test('zoom toggle key: Z switches between fit and 100% (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-zoom');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await page.getByTestId('photos-zoom-fit').click(); // normalize: persisted zoom from earlier legs
  await expect(page.getByTestId('photos-zoom-fit')).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('z');
  await expect(page.getByTestId('photos-zoom-level')).toHaveText('100%');
  await expect(page.getByTestId('photos-zoom-preset-100')).toHaveAttribute('aria-pressed','true'); // real 1.0 zoom
  await page.screenshot({path:`test-results/ds-photos-zoom-toggle-${theme}.png`,fullPage:true});
  await page.keyboard.press('z');
  await expect(page.getByTestId('photos-zoom-fit')).toHaveAttribute('aria-pressed','true'); // back to fit
 }
});
test('RGB readout: hovering the stage shows the pixel values, leaving hides them (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-zoom');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  const stage=page.getByTestId('photos-stage');
  const box=await stage.boundingBox();
  await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);
  const readout=page.getByTestId('photos-rgb-readout');
  await expect(readout).toBeVisible();
  const text=await readout.innerText();
  expect(text).toMatch(/^R \d+ G \d+ B \d+%$/);
  const r=Number(text.match(/^R (\d+)/)![1]);
  expect(r).toBeGreaterThan(40);expect(r).toBeLessThan(65); // gradient center ~51%
  await page.screenshot({path:`test-results/ds-photos-rgb-readout-${theme}.png`,fullPage:true});
  await page.mouse.move(box!.x+box!.width/2,box!.y-20); // leave the stage
  await expect(readout).toHaveCount(0);
 }
});
