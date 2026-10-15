import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
test.use({viewport:{width:1200,height:900}});
test('filmstrip lists the developable photos and switches the active one',async({page})=>{
 await page.goto('/test/design-system/?view=photos-filmstrip');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await expect(page.getByTestId('photos-filmstrip')).toBeVisible();
 await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toHaveAttribute('aria-pressed','true');
 await page.getByTestId('photos-filmstrip-item-strip-2.png').click();
 await expect(page.getByTestId('photos-name')).toHaveText('strip-2.png');
 await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toHaveAttribute('aria-pressed','true');
 await expect(page.getByTestId('photos-position')).toHaveText('2 / 3');
 await page.getByTestId('photos-filmstrip-item-strip-3.png').click();
 await expect(page.getByTestId('photos-name')).toHaveText('strip-3.png');
 await expect(page.getByTestId('photos-position')).toHaveText('3 / 3');
});
test('filmstrip renders in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await page.getByTestId('photos-zoom-actual').click();
  await page.waitForTimeout(500);
  const png=await page.getByTestId('photos-canvas').evaluate(c=>(c as HTMLCanvasElement).toDataURL('image/png'));
  await writeFile(`test-results/ds-photos-filmstrip-canvas-${theme}.png`,Buffer.from(png.split(',')[1],'base64'));
  const thumb=page.getByTestId('photos-filmstrip-item-strip-2.png');
  if(await thumb.count()){await thumb.click();await expect(page.getByTestId('photos-position')).toHaveText('2 / 3');}
  await page.waitForTimeout(300);
  await page.screenshot({path:`test-results/ds-photos-filmstrip-${theme}.png`,fullPage:true});
 }
});
test('ratings: stars rate the active photo, badges show on thumbs, the filter narrows the strip',async({page})=>{
 await page.goto('/test/design-system/?view=photos-filmstrip');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await expect(page.getByTestId('photos-filmstrip')).toBeVisible();
 await page.getByTestId('photos-filmstrip-rating-star-4').click();
 await expect(page.getByTestId('photos-filmstrip-rating-badge-strip-1.png')).toHaveText('4');
 await page.getByTestId('photos-filmstrip-rating-filter').selectOption('4');
 await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toBeVisible();
 await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toHaveCount(0);
 await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toHaveCount(0);
 await page.screenshot({path:'test-results/ds-photos-rating-filtered.png',fullPage:true});
 await page.getByTestId('photos-filmstrip-rating-filter').selectOption('0');
 await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toBeVisible();
 await page.reload();
 await expect(page.getByTestId('photos-filmstrip')).toBeVisible();
 await expect(page.getByTestId('photos-filmstrip-rating-badge-strip-1.png')).toHaveText('4'); // rating survives the reload
 await page.getByTestId('photos-filmstrip-rating-star-4').click(); // clicking the current rating clears it
 await expect(page.getByTestId('photos-filmstrip-rating-badge-strip-1.png')).toHaveCount(0);
});
test('ratings render in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively - settle so the active photo is stable
  if(theme==='light')await page.getByTestId('photos-filmstrip-rating-star-5').click(); // persists into the dark leg via localStorage
  await expect(page.getByTestId('photos-filmstrip-rating-badge-strip-1.png')).toHaveText('5');
  await page.waitForTimeout(300);
  await page.screenshot({path:`test-results/ds-photos-rating-${theme}.png`,fullPage:true});
 }
});
test('keyboard: arrows walk the library, digits rate the active photo, inputs keep their keys',async({page})=>{
 await page.goto('/test/design-system/?view=photos-filmstrip');
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
 await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // all three loaded: the nav neighbours exist
 await expect(page.getByTestId('photos-name')).toHaveText('strip-1.png');
 await page.keyboard.press('ArrowRight');
 await expect(page.getByTestId('photos-name')).toHaveText('strip-2.png');
 await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toHaveAttribute('aria-pressed','true');
 await page.keyboard.press('3');
 await expect(page.getByTestId('photos-filmstrip-rating-badge-strip-2.png')).toHaveText('3');
 await page.keyboard.press('0');
 await expect(page.getByTestId('photos-filmstrip-rating-badge-strip-2.png')).toHaveCount(0);
 await page.keyboard.press('ArrowLeft');
 await expect(page.getByTestId('photos-name')).toHaveText('strip-1.png');
 await page.keyboard.press('ArrowLeft'); // no previous photo: stays put
 await expect(page.getByTestId('photos-name')).toHaveText('strip-1.png');
 await page.getByTestId('photos-filmstrip-rating-filter').click(); // an editable control owns the keys now
 await page.keyboard.press('ArrowRight');
 await expect(page.getByTestId('photos-name')).toHaveText('strip-1.png'); // no navigation while the select is focused
});
test('keyboard navigation and digit rating render in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // all three loaded: the nav neighbours exist
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('photos-name')).toHaveText('strip-2.png');
  await page.keyboard.press('4');
  await expect(page.getByTestId('photos-filmstrip-rating-badge-strip-2.png')).toHaveText('4');
  await page.waitForTimeout(300);
  await page.screenshot({path:`test-results/ds-photos-keyboard-${theme}.png`,fullPage:true});
 }
});
test('flags: P picks, X rejects, U unflags; the filter narrows by flag (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible();
  await page.keyboard.press('p'); // strip-1 picked
  await expect(page.getByTestId('photos-filmstrip-flag-strip-1.png')).toHaveAttribute('data-flag','pick');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('x'); // strip-2 rejected
  await expect(page.getByTestId('photos-filmstrip-flag-strip-2.png')).toHaveAttribute('data-flag','reject');
  await page.getByTestId('photos-filmstrip-rating-filter').selectOption('pick');
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toHaveCount(0);
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toHaveCount(0);
  await page.getByTestId('photos-filmstrip-rating-filter').selectOption('reject');
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toHaveCount(0);
  await page.getByTestId('photos-filmstrip-rating-filter').selectOption('0');
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible();
  await page.screenshot({path:`test-results/ds-photos-flags-${theme}.png`,fullPage:true});
  await page.keyboard.press('u'); // strip-2 unflagged
  await expect(page.getByTestId('photos-filmstrip-flag-strip-2.png')).toHaveCount(0);
 }
});
test('filmstrip sort: rating reorders the strip, library restores it (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  const sort=page.getByTestId('photos-filmstrip-sort');
  if(await sort.inputValue()!=='library')await sort.selectOption('library'); // normalize persisted sort
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // the proof adds its media files progressively
  const names=()=>page.getByTestId('photos-filmstrip').locator('[data-testid^="photos-filmstrip-item-"]').evaluateAll(els=>els.map(e=>e.getAttribute('data-testid')!.replace('photos-filmstrip-item-','')));
  expect(await names()).toEqual(['strip-1.png','strip-2.png','strip-3.png']);
  await page.getByTestId('photos-filmstrip-item-strip-2.png').click();
  await page.keyboard.press('3'); // rate strip-2 three stars
  await page.getByTestId('photos-filmstrip-item-strip-1.png').click();
  await page.keyboard.press('5'); // rate strip-1 five stars
  await sort.selectOption('rating');
  expect(await names()).toEqual(['strip-1.png','strip-2.png','strip-3.png']); // 5 stars first, then 3, unrated last
  await page.screenshot({path:`test-results/ds-photos-filmstrip-sort-${theme}.png`,fullPage:true});
  await sort.selectOption('library');
  expect(await names()).toEqual(['strip-1.png','strip-2.png','strip-3.png']); // back to library order
 }
});
test('Home/End jump to the first and last photo (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.getByTestId('photos-filmstrip-item-strip-2.png').click(); // start in the middle
  await expect(page.getByTestId('photos-name')).toHaveText('strip-2.png');
  await page.keyboard.press('End');
  await expect(page.getByTestId('photos-name')).toHaveText('strip-3.png');
  await expect(page.getByTestId('photos-position')).toHaveText('3 / 3');
  await page.screenshot({path:`test-results/ds-photos-home-end-${theme}.png`,fullPage:true});
  await page.keyboard.press('Home');
  await expect(page.getByTestId('photos-name')).toHaveText('strip-1.png');
  await expect(page.getByTestId('photos-position')).toHaveText('1 / 3');
  await page.keyboard.press('Home'); // already first: stays put
  await expect(page.getByTestId('photos-name')).toHaveText('strip-1.png');
 }
});
test('multi-select: ctrl/shift select, apply look to the selection (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible();
  await page.getByTestId('photos-filmstrip-item-strip-1.png').click(); // plain click: single selection + active
  await page.evaluate(async()=>{const mod=await import('/src/lib/photos/studioSession.ts');mod.commitPhotoSettings('strip-1.png',(s:{exposure:number})=>({...s,exposure:1.2}));});
  await page.getByTestId('photos-filmstrip-item-strip-3.png').click({modifiers:['ControlOrMeta']}); // ctrl: add to the selection
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toHaveAttribute('data-selected','true');
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toHaveAttribute('data-selected','true');
  const apply=page.getByTestId('photos-filmstrip-apply');
  await expect(apply).toBeVisible();
  await expect(apply).toHaveText(/2/);
  await page.screenshot({path:`test-results/ds-photos-multiselect-${theme}.png`,fullPage:true});
  await apply.click();
  await expect(page.getByTestId('photos-filmstrip-apply-note')).toBeVisible();
  const exposure=await page.evaluate(async()=>{const mod=await import('/src/lib/photos/studioSession.ts');return mod.getPhotoSession('strip-3.png')!.now.exposure;});
  expect(exposure).toBe(1.2); // the look landed on the selected photo
  const untouched=await page.evaluate(async()=>{const mod=await import('/src/lib/photos/studioSession.ts');return mod.getPhotoSession('strip-2.png')!.now.exposure;});
  expect(untouched).toBe(0); // not selected: untouched
  await page.getByTestId('photos-filmstrip-item-strip-1.png').click();
  await page.getByTestId('photos-filmstrip-item-strip-3.png').click({modifiers:['Shift']}); // shift: range 1..3
  await expect(apply).toHaveText(/3/);
  await page.getByTestId('photos-filmstrip-item-strip-1.png').click(); // plain click collapses the selection
  await expect(apply).toHaveCount(0);
 }
});
test('batch culling: rating and flag keys hit every selected photo (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible();
  await page.getByTestId('photos-filmstrip-item-strip-1.png').click();
  await page.getByTestId('photos-filmstrip-item-strip-3.png').click({modifiers:['ControlOrMeta']}); // two selected
  await page.keyboard.press('4');
  await expect(page.getByTestId('photos-filmstrip-rating-badge-strip-1.png')).toHaveText('4');
  await expect(page.getByTestId('photos-filmstrip-rating-badge-strip-3.png')).toHaveText('4');
  await expect(page.getByTestId('photos-filmstrip-rating-badge-strip-2.png')).toHaveCount(0); // unselected stays unrated
  await page.keyboard.press('x');
  await expect(page.getByTestId('photos-filmstrip-flag-strip-1.png')).toHaveAttribute('data-flag','reject');
  await expect(page.getByTestId('photos-filmstrip-flag-strip-3.png')).toHaveAttribute('data-flag','reject');
  await page.screenshot({path:`test-results/ds-photos-batch-cull-${theme}.png`,fullPage:true});
  await page.keyboard.press('u'); // clear the flags again
  await expect(page.getByTestId('photos-filmstrip-flag-strip-1.png')).toHaveCount(0);
  await page.keyboard.press('0'); // and the ratings
  await expect(page.getByTestId('photos-filmstrip-rating-badge-strip-1.png')).toHaveCount(0);
 }
});
test('batch preset: applying a built-in preset hits every selected photo (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible();
  await page.getByTestId('photos-filmstrip-item-strip-1.png').click();
  await page.getByTestId('photos-filmstrip-item-strip-3.png').click({modifiers:['ControlOrMeta']});
  const picker=page.getByTestId('photos-filmstrip-apply-preset');
  await expect(picker).toBeVisible();
  await page.screenshot({path:`test-results/ds-photos-batch-preset-${theme}.png`,fullPage:true});
  await picker.selectOption('bw');
  await expect(page.getByTestId('photos-filmstrip-apply-note')).toBeVisible();
  for(const n of['strip-1.png','strip-3.png']){
   const sat=await page.evaluate(async name=>{const mod=await import('/src/lib/photos/studioSession.ts');return mod.getPhotoSession(name)!.now.saturation;},n);
   expect(sat).toBe(-100); // the b/w look landed
  }
  const other=await page.evaluate(async()=>{const mod=await import('/src/lib/photos/studioSession.ts');return mod.getPhotoSession('strip-2.png')!.now.saturation;});
  expect(other).toBe(0); // unselected untouched
  await expect(picker).toHaveValue(''); // the picker resets for the next run
  await page.evaluate(async()=>{const mod=await import('/src/lib/photos/studioSession.ts');for(const n of['strip-1.png','strip-3.png'])mod.commitPhotoSettings(n,(s:{saturation:number})=>({...s,saturation:0}));}); // clean up for the next leg
 }
});
test('auto-advance: rating keys move to the next photo when enabled (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible();
  await page.getByTestId('photos-filmstrip-item-strip-1.png').click();
  const toggle=page.getByTestId('photos-filmstrip-autoadvance');
  if(await toggle.getAttribute('aria-pressed')!=='true')await toggle.click();
  await page.keyboard.press('4');
  await expect(page.getByTestId('photos-filmstrip-rating-badge-strip-1.png')).toHaveText('4');
  await expect(page.getByTestId('photos-name')).toHaveText('strip-2.png'); // advanced
  await page.keyboard.press('x');
  await expect(page.getByTestId('photos-filmstrip-flag-strip-2.png')).toHaveAttribute('data-flag','reject');
  await expect(page.getByTestId('photos-name')).toHaveText('strip-3.png'); // advanced again
  await page.screenshot({path:`test-results/ds-photos-autoadvance-${theme}.png`,fullPage:true});
  await page.keyboard.press('p'); // last photo: nowhere to advance
  await expect(page.getByTestId('photos-name')).toHaveText('strip-3.png');
  await page.getByTestId('photos-filmstrip-item-strip-1.png').click();
  await page.getByTestId('photos-filmstrip-item-strip-2.png').click({modifiers:['ControlOrMeta']}); // multi-selection: no advance
  await page.keyboard.press('u');
  await expect(page.getByTestId('photos-name')).toHaveText('strip-1.png');
  await toggle.click(); // off
  await page.getByTestId('photos-filmstrip-item-strip-2.png').click(); // collapses selection
  await page.keyboard.press('0');
  await expect(page.getByTestId('photos-name')).toHaveText('strip-2.png'); // stays put
  await page.keyboard.press('0');
  await page.getByTestId('photos-filmstrip-item-strip-3.png').click();
  await page.keyboard.press('u');await page.keyboard.press('0'); // clean up for the next leg
  await page.getByTestId('photos-filmstrip-item-strip-1.png').click();
  await page.keyboard.press('0');
 }
});
test('survey: selected photos render side by side, clicking picks one (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible();
  await page.getByTestId('photos-filmstrip-item-strip-1.png').click();
  await page.getByTestId('photos-filmstrip-item-strip-3.png').click({modifiers:['ControlOrMeta']});
  await page.getByTestId('photos-filmstrip-survey').click();
  await expect(page.getByTestId('photos-survey')).toBeVisible();
  await expect(page.getByTestId('photos-survey-count')).toHaveText(/2/);
  await expect(page.getByTestId('photos-survey-item-strip-1.png')).toBeVisible();
  await expect(page.getByTestId('photos-survey-item-strip-3.png')).toBeVisible();
  await expect(page.getByTestId('photos-survey-item-strip-2.png')).toHaveCount(0); // unselected not surveyed
  const painted=async(n:string)=>page.evaluate(name=>{const c=document.querySelector(`[data-testid="photos-survey-canvas-${name}"]`) as HTMLCanvasElement;const d=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;for(let i=0;i<d.length;i+=97)if(d[i]!==0)return true;return false;},n);
  await expect.poll(()=>painted('strip-1.png')).toBe(true); // the developed frame actually painted
  await expect.poll(()=>painted('strip-3.png')).toBe(true);
  await page.screenshot({path:`test-results/ds-photos-survey-${theme}.png`,fullPage:true});
  await page.evaluate(async()=>{const m=await import('/src/lib/photos/ratings.ts');m.setRating('strip-3.png',0);}); // the other leg's rating persists via localStorage
  await page.getByTestId('photos-survey-strip-3.png-rating-star-4').click(); // rate inside the survey
  await expect(page.getByTestId('photos-filmstrip-rating-badge-strip-3.png')).toHaveText('4'); // same store as the strip
  await page.getByTestId('photos-survey-reject-flag-strip-1.png').click();
  await expect(page.getByTestId('photos-filmstrip-flag-strip-1.png')).toHaveAttribute('data-flag','reject');
  await page.getByTestId('photos-survey-pick-flag-strip-1.png').click(); // pick replaces reject
  await expect(page.getByTestId('photos-filmstrip-flag-strip-1.png')).toHaveAttribute('data-flag','pick');
  await page.getByTestId('photos-survey-pick-flag-strip-1.png').click(); // toggles off
  await expect(page.getByTestId('photos-survey-pick-flag-strip-1.png')).toHaveAttribute('aria-pressed','false');
  await page.getByTestId('photos-survey-pick-strip-3.png').click();
  await expect(page.getByTestId('photos-survey')).toHaveCount(0); // pick closes the survey
  await expect(page.getByTestId('photos-name')).toHaveText('strip-3.png');
  await page.getByTestId('photos-filmstrip-survey').click();
  await expect(page.getByTestId('photos-survey')).toBeVisible();
  await page.keyboard.press('Escape'); // Escape closes too
  await expect(page.getByTestId('photos-survey')).toHaveCount(0);
 }
});
test('remove rejected: two-click confirm drops rejects from the library (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible();
  await page.evaluate(async()=>{const h=await import('/src/lib/photos/hidden.ts');h.unhideAll();}); // hidden photos persist via localStorage
  await page.getByTestId('photos-filmstrip-item-strip-2.png').click();
  await page.keyboard.press('x'); // reject the middle photo
  const remove=page.getByTestId('photos-filmstrip-remove-rejects');
  await expect(remove).toBeVisible();
  await expect(remove).toHaveText(/1/);
  await remove.click(); // first click only arms
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toBeVisible();
  await page.screenshot({path:`test-results/ds-photos-remove-rejects-${theme}.png`,fullPage:true});
  await remove.click(); // second click executes
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toHaveCount(0);
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toBeVisible(); // the rest stays
  await expect(page.getByTestId('photos-position')).toHaveText(/\/ 2/); // library view shrank
  await expect(remove).toHaveCount(0); // no rejects left: button gone
  await page.evaluate(async()=>{const h=await import('/src/lib/photos/hidden.ts');h.unhideAll();}); // undo: originals never leave the app
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toBeVisible();
 }
});
test('copy/paste settings and the unrated filter (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const m=await import('/src/lib/photos/ratings.ts');m.setRating('strip-1.png',0);}); // the other leg's rating persists via localStorage
  const filter=page.getByTestId('photos-filmstrip-rating-filter');
  await filter.selectOption('unrated');
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // all three unrated
  await page.getByTestId('photos-filmstrip-rating-star-3').click(); // rate the active strip-1
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toHaveCount(0); // rated photo leaves the unrated view
  await filter.selectOption('0');
  await page.evaluate(async()=>{const m=await import('/src/lib/photos/studioSession.ts');m.commitPhotoSettings('strip-1.png',s=>({...s,temp:7800}));});
  await page.getByTestId('photos-filmstrip-item-strip-1.png').click();
  await page.getByTestId('photos-filmstrip-copy').click();
  await page.getByTestId('photos-filmstrip-item-strip-2.png').click();
  await page.getByTestId('photos-filmstrip-paste').click();
  const temp=await page.evaluate(async()=>{const m=await import('/src/lib/photos/studioSession.ts');return m.getPhotoSession('strip-2.png')?.now.temp;});
  expect(temp).toBe(7800);
  await page.screenshot({path:`test-results/ds-photos-copy-paste-${theme}.png`,fullPage:true});
 }
});
test('paste applies to the selection and WB presets join the preset dropdown (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const m=await import('/src/lib/photos/studioSession.ts');m.commitPhotoSettings('strip-1.png',s=>({...s,temp:7800}));});
  await page.getByTestId('photos-filmstrip-item-strip-1.png').click();
  await page.getByTestId('photos-filmstrip-item-strip-2.png').click({modifiers:['ControlOrMeta']}); // two selected
  await page.getByTestId('photos-filmstrip-copy').click();
  await page.getByTestId('photos-filmstrip-paste').click(); // paste onto both selected photos
  await expect(page.getByTestId('photos-filmstrip-apply-note')).toBeVisible();
  const temps=await page.evaluate(async()=>{const m=await import('/src/lib/photos/studioSession.ts');return [m.getPhotoSession('strip-1.png')?.now.temp,m.getPhotoSession('strip-2.png')?.now.temp];});
  expect(temps).toEqual([7800,7800]);
  await page.getByTestId('photos-filmstrip-apply-preset').selectOption('wb:cloudy'); // WB preset on the selection
  const wb=await page.evaluate(async()=>{const m=await import('/src/lib/photos/studioSession.ts');const s=m.getPhotoSession('strip-1.png')?.now;return [s?.temp,s?.tint];});
  expect(wb).toEqual([7000,20]);
  await page.screenshot({path:`test-results/ds-photos-paste-selection-${theme}.png`,fullPage:true});
 }
});
test('selection helpers: all, unrated, clear (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const m=await import('/src/lib/photos/ratings.ts');for(const n of['strip-1.png','strip-2.png','strip-3.png'])m.setRating(n,0);}); // ratings persist via localStorage
  await page.getByTestId('photos-filmstrip-rating-star-2').click(); // rate the active strip-1
  await page.getByTestId('photos-filmstrip-select').selectOption('unrated');
  await expect(page.getByTestId('photos-filmstrip-apply')).toHaveText('Apply to 2 photos'); // strip-2 + strip-3
  await page.getByTestId('photos-filmstrip-select').selectOption('all');
  await expect(page.getByTestId('photos-filmstrip-apply')).toHaveText('Apply to 3 photos');
  await page.screenshot({path:`test-results/ds-photos-select-helpers-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-filmstrip-select').selectOption('none');
  await expect(page.getByTestId('photos-filmstrip-apply')).toHaveCount(0);
 }
});
test('color labels: batch set, badge, filter, clear (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const m=await import('/src/lib/photos/labels.ts');for(const n of['strip-1.png','strip-2.png','strip-3.png'])m.setLabel(n,null);}); // labels persist via localStorage
  await page.getByTestId('photos-filmstrip-item-strip-1.png').click();
  await page.getByTestId('photos-filmstrip-item-strip-2.png').click({modifiers:['ControlOrMeta']}); // two selected
  await page.getByTestId('photos-filmstrip-label').selectOption('red'); // labels the whole selection
  await expect(page.getByTestId('photos-filmstrip-label-strip-1.png')).toHaveAttribute('data-label','red');
  await expect(page.getByTestId('photos-filmstrip-label-strip-2.png')).toHaveAttribute('data-label','red');
  await page.getByTestId('photos-filmstrip-rating-filter').selectOption('label:red');
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toHaveCount(0); // unlabeled photo leaves the view
  await page.screenshot({path:`test-results/ds-photos-labels-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-filmstrip-rating-filter').selectOption('0');
  await page.getByTestId('photos-filmstrip-label').selectOption('none');
  await expect(page.getByTestId('photos-filmstrip-label-strip-1.png')).toHaveCount(0);
 }
});
test('capture sort: EXIF dates order the strip oldest-first, undated last (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  const names=()=>page.getByTestId('photos-filmstrip').locator('[data-testid^="photos-filmstrip-item-"]').evaluateAll(els=>els.map(e=>e.getAttribute('data-testid')!.replace('photos-filmstrip-item-','')));
  await page.evaluate(async()=>{ // seed the date cache directly: strip-3 oldest, strip-1 middle, strip-2 undated
   const m=await import('/src/lib/photos/captureDates.ts');
   const med=await import('/src/lib/media.ts');
   const size=(n:string)=>med.getMedia().items.find(i=>i.name===n)!.size;
   m.putCaptureDate('strip-3.png',size('strip-3.png'),new Date(2024,0,15,12,0,0).getTime());
   m.putCaptureDate('strip-1.png',size('strip-1.png'),new Date(2025,5,20,12,0,0).getTime());
   m.putCaptureDate('strip-2.png',size('strip-2.png'),null);
  });
  const sort=page.getByTestId('photos-filmstrip-sort');
  await sort.selectOption('capture');
  await expect.poll(names).toEqual(['strip-3.png','strip-1.png','strip-2.png']); // oldest first, undated last
  await page.screenshot({path:`test-results/ds-photos-sort-capture-${theme}.png`,fullPage:true});
  await sort.selectOption('library');
  await expect.poll(names).toEqual(['strip-1.png','strip-2.png','strip-3.png']); // back to library order
 }
});

test('label keys: 6-9 set color labels on the selection (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const m=await import('/src/lib/photos/labels.ts');for(const n of['strip-1.png','strip-2.png','strip-3.png'])m.setLabel(n,null);}); // labels persist via localStorage
  await page.getByTestId('photos-filmstrip-item-strip-1.png').click();
  await page.getByTestId('photos-filmstrip-item-strip-2.png').click({modifiers:['ControlOrMeta']}); // two selected
  await page.keyboard.press('7'); // yellow on the selection
  await expect(page.getByTestId('photos-filmstrip-label-strip-1.png')).toHaveAttribute('data-label','yellow');
  await expect(page.getByTestId('photos-filmstrip-label-strip-2.png')).toHaveAttribute('data-label','yellow');
  await page.screenshot({path:`test-results/ds-photos-label-keys-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-filmstrip-item-strip-3.png').click(); // collapses the selection, single target
  await page.keyboard.press('9'); // blue on strip-3
  await expect(page.getByTestId('photos-filmstrip-label-strip-3.png')).toHaveAttribute('data-label','blue');
 }
});

test('soft proof: the print simulation repaints the canvas, the gamut warning overlays (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const m=await import('/src/store/panelStateStore.ts');m.panelStateStore.set('photos.softProof',false);m.panelStateStore.set('photos.gamutWarn',false);m.panelStateStore.set('photos.proofModel','coated');m.panelStateStore.set('photos.gamutShare',0);}); // view state persists via localStorage
  await page.waitForTimeout(300);
  const canvasUrl=()=>page.getByTestId('photos-canvas').evaluate(c=>(c as HTMLCanvasElement).toDataURL('image/png'));
  const before=await canvasUrl();
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-softproof').click();
  await page.keyboard.press('Escape');
  await expect.poll(canvasUrl).not.toBe(before); // the proof repaints with the print simulation
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-gamut').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('photos-gamut-canvas')).toBeVisible();
  await page.getByTestId('photos-filmstrip-menu').click(); // menu stays open across in-menu actions
  const share=page.getByTestId('photos-filmstrip-gamut-share');
  await expect(share).toContainText('%'); // the workspace publishes the share
  const coatedText=(await share.textContent())!;
  await page.getByTestId('photos-filmstrip-proof-model').selectOption('newsprint');
  await expect(share).not.toHaveText(coatedText); // the narrower stock clips more
  await page.screenshot({path:`test-results/ds-photos-softproof-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-filmstrip-proof-model').selectOption('coated'); // cleanup: model persists via localStorage
  await page.getByTestId('photos-filmstrip-softproof').click();
  await page.getByTestId('photos-filmstrip-gamut').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('photos-gamut-canvas')).toHaveCount(0);
  await expect.poll(canvasUrl).toBe(before); // proof off restores the exact pixels
 }
});

test('library grid: the survey opens the whole filtered view without a selection (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const m=await import('/src/lib/photos/labels.ts');for(const n of['strip-1.png','strip-2.png','strip-3.png'])m.setLabel(n,null);m.setLabel('strip-1.png','blue');});
  await page.getByTestId('photos-filmstrip-select').selectOption('none'); // no selection: the grid shows the library
  await page.getByTestId('photos-filmstrip-survey').click();
  await expect(page.getByTestId('photos-survey-item-strip-1.png')).toBeVisible();
  await expect(page.getByTestId('photos-survey-item-strip-2.png')).toBeVisible();
  await expect(page.getByTestId('photos-survey-item-strip-3.png')).toBeVisible();
  await expect(page.getByTestId('photos-survey-label-strip-1.png')).toHaveAttribute('data-label','blue'); // label dots in the grid
  await page.screenshot({path:`test-results/ds-photos-library-grid-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-survey-pick-strip-3.png').click();
  await expect(page.getByTestId('photos-survey')).toHaveCount(0);
  await expect(page.getByTestId('photos-name')).toHaveText('strip-3.png');
  await page.evaluate(async()=>{const m=await import('/src/lib/photos/labels.ts');m.setLabel('strip-1.png',null);});
 }
});
test('library grid: its filter and sort controls drive the grid live (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const m=await import('/src/lib/photos/labels.ts');for(const n of['strip-1.png','strip-2.png','strip-3.png'])m.setLabel(n,null);m.setLabel('strip-2.png','red');});
  await page.getByTestId('photos-filmstrip-select').selectOption('none');
  await page.getByTestId('photos-filmstrip-survey').click();
  await expect(page.getByTestId('photos-survey-item-strip-3.png')).toBeVisible();
  await page.getByTestId('photos-survey-filter').selectOption('label:red');
  await expect(page.getByTestId('photos-survey-item-strip-2.png')).toBeVisible(); // only the red-labeled photo stays
  await expect(page.getByTestId('photos-survey-item-strip-1.png')).toHaveCount(0);
  await expect(page.getByTestId('photos-survey-item-strip-3.png')).toHaveCount(0);
  await page.screenshot({path:`test-results/ds-photos-grid-filter-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-survey-pick-strip-2.png').click(); // pick closes the grid
  await expect(page.getByTestId('photos-filmstrip-rating-filter')).toHaveValue('label:red'); // the filmstrip filter follows the shared state
  await page.getByTestId('photos-filmstrip-rating-filter').selectOption('0');
  await page.evaluate(async()=>{const m=await import('/src/lib/photos/labels.ts');m.setLabel('strip-2.png',null);});
 }
});
test('library grid: cells toggle the filmstrip selection (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.getByTestId('photos-filmstrip-select').selectOption('none'); // selection persists via localStorage
  await page.getByTestId('photos-filmstrip-survey').click();
  await expect(page.getByTestId('photos-survey-item-strip-3.png')).toBeVisible();
  await page.getByTestId('photos-survey-select-strip-1.png').click();
  await page.getByTestId('photos-survey-select-strip-3.png').click();
  await expect(page.getByTestId('photos-survey-select-strip-1.png')).toHaveAttribute('aria-pressed','true');
  await expect(page.getByTestId('photos-survey-selcount')).toBeVisible();
  await page.screenshot({path:`test-results/ds-photos-grid-select-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-survey-close').click();
  await expect(page.getByTestId('photos-filmstrip-apply')).toHaveText('Apply to 2 photos'); // the grid selection drives batch apply
  await page.getByTestId('photos-filmstrip-select').selectOption('none');
 }
});
test('keyword tags: batch edit, badges, dynamic filter (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const m=await import('/src/lib/photos/tags.ts');for(const n of['strip-1.png','strip-2.png','strip-3.png'])m.setTags(n,[]);}); // tags persist via localStorage
  await page.getByTestId('photos-filmstrip-select').selectOption('none');
  await page.getByTestId('photos-filmstrip-item-strip-1.png').click();
  await page.getByTestId('photos-filmstrip-item-strip-2.png').click({modifiers:['ControlOrMeta']}); // two selected
  await page.getByTestId('photos-filmstrip-tags').fill('reise, 2026');
  await page.getByTestId('photos-filmstrip-tags').press('Enter'); // batch: merges onto both
  await expect(page.getByTestId('photos-filmstrip-tags-badge-strip-1.png')).toHaveText('reise +1');
  await expect(page.getByTestId('photos-filmstrip-tags-badge-strip-2.png')).toHaveText('reise +1');
  await page.getByTestId('photos-filmstrip-rating-filter').selectOption('tag:reise'); // dynamic option from the library's tags
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toHaveCount(0); // untagged photo leaves the view
  await page.screenshot({path:`test-results/ds-photos-tags-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-filmstrip-rating-filter').selectOption('0');
  await page.evaluate(async()=>{const m=await import('/src/lib/photos/tags.ts');for(const n of['strip-1.png','strip-2.png','strip-3.png'])m.setTags(n,[]);});
 }
});
test('library search: name and tag matches narrow the strip (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const m=await import('/src/lib/photos/tags.ts');for(const n of['strip-1.png','strip-2.png','strip-3.png'])m.setTags(n,[]);m.setTags('strip-2.png',['reise']);});
  const search=page.getByTestId('photos-filmstrip-search');
  await search.fill('');
  await search.fill('STRIP-1'); // case-insensitive name match
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toHaveCount(0);
  await search.fill('reise'); // tag match
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toHaveCount(0);
  await page.screenshot({path:`test-results/ds-photos-search-${theme}.png`,fullPage:true});
  await search.fill(''); // back to the full strip
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible();
  await page.evaluate(async()=>{const m=await import('/src/lib/photos/tags.ts');m.setTags('strip-2.png',[]);});
 }
});
test('collections: save, apply and delete a filter set (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.getByTestId('photos-filmstrip-search').fill('');
  await page.getByTestId('photos-filmstrip-search').fill('strip-1');
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-collection-save').click();
  await page.getByTestId('photos-filmstrip-collection-name').fill('Nur eins');
  await page.getByTestId('photos-filmstrip-collection-name').press('Enter');
  await page.getByTestId('photos-filmstrip-search').fill(''); // state changes away from the set
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible();
  await page.getByTestId('photos-filmstrip-collections').selectOption('Nur eins'); // apply: search comes back
  await expect(page.getByTestId('photos-filmstrip-search')).toHaveValue('strip-1');
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toHaveCount(0);
  await page.screenshot({path:`test-results/ds-photos-collections-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-filmstrip-collection-delete').click(); // visible while the current state matches the set
  await page.getByTestId('photos-filmstrip-search').fill('');
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible();
 }
});
test('stacks: group, collapse, expand, ungroup (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const m=await import('/src/lib/photos/stacks.ts');for(const n of['strip-1.png','strip-2.png','strip-3.png']){const id=m.getStack(n);if(id)m.ungroupStacks([id]);}}); // stacks persist via localStorage
  await page.getByTestId('photos-filmstrip-select').selectOption('all');
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-stack-group').click(); // group all three
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toHaveCount(0); // collapsed: only the cover stays
  await expect(page.getByTestId('photos-filmstrip-stack-count-strip-1.png')).toHaveText('3');
  await page.screenshot({path:`test-results/ds-photos-stacks-${theme}.png`,fullPage:true});
  await page.locator('[data-testid^="photos-filmstrip-stack-open-"]').first().click(); // expand inline
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toBeVisible();
  await page.locator('[data-testid^="photos-filmstrip-stack-close-"]').first().click(); // collapse again
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toHaveCount(0);
  await page.getByTestId('photos-filmstrip-stack-ungroup').click(); // selection still holds all three
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-stack-count-strip-1.png')).toHaveCount(0);
  await page.getByTestId('photos-filmstrip-select').selectOption('none');
 }
});
test('auto-stack: burst detection stacks the series in one click (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const m=await import('/src/lib/photos/stacks.ts');for(const n of['strip-1.png','strip-2.png','strip-3.png']){const id=m.getStack(n);if(id)m.ungroupStacks([id]);}}); // stacks persist via localStorage
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-stack-auto').click(); // strip-1..3 are a numbered series
  await expect(page.getByTestId('photos-filmstrip-apply-note')).toHaveText('1 series stacked');
  await expect(page.getByTestId('photos-filmstrip-stack-count-strip-1.png')).toHaveText('3');
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toHaveCount(0);
  await page.screenshot({path:`test-results/ds-photos-autostack-${theme}.png`,fullPage:true});
  await page.evaluate(async()=>{const m=await import('/src/lib/photos/stacks.ts');for(const n of['strip-1.png','strip-2.png','strip-3.png']){const id=m.getStack(n);if(id)m.ungroupStacks([id]);}});
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible();
 }
});
test('smart filter: the grouped menu combines rating, flag, label and tag (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const r=await import('/src/lib/photos/ratings.ts');const f=await import('/src/lib/photos/flags.ts');for(const n of['strip-1.png','strip-2.png','strip-3.png']){r.setRating(n,0);f.setFlag(n,null);}}); // ratings/flags persist via localStorage
  await page.keyboard.press('3'); // strip-1: three stars
  await page.keyboard.press('p'); // strip-1: picked
  await page.getByTestId('photos-filmstrip-item-strip-2.png').click();
  await page.keyboard.press('4'); // strip-2: four stars, no flag
  await page.getByTestId('photos-filmstrip-menu').click();
  await expect(page.getByTestId('photos-filmstrip-menu')).toHaveAttribute('aria-expanded','true');
  await expect(page.getByTestId('photos-filmstrip-menu-panel')).toBeVisible();
  const smart=page.getByTestId('photos-filmstrip-smart');
  if(await smart.getAttribute('aria-pressed')!=='true')await smart.click(); // persisted panel state
  await page.getByTestId('photos-smart-minrating').selectOption('2');
  await page.getByTestId('photos-smart-flag').selectOption('pick');
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toBeVisible(); // 3 stars + pick passes both rules
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toHaveCount(0); // 4 stars but not picked
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toHaveCount(0);
  await page.screenshot({path:`test-results/ds-photos-smart-menu-${theme}.png`,fullPage:true}); // open grouped menu
  await smart.click(); // off: the whole strip comes back
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible();
  await page.keyboard.press('Escape'); // close the menu
  await expect(page.getByTestId('photos-filmstrip-menu-panel')).toHaveCount(0);
  await page.evaluate(async()=>{const r=await import('/src/lib/photos/ratings.ts');const f=await import('/src/lib/photos/flags.ts');for(const n of['strip-1.png','strip-2.png','strip-3.png']){r.setRating(n,0);f.setFlag(n,null);}}); // leave no state behind
 }
});
test('smart filter camera: narrows the strip to the chosen EXIF camera (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{
   const ps=await import('/src/store/panelStateStore.ts');const cd=await import('/src/lib/photos/captureDates.ts');const med=await import('/src/lib/media.ts');
   ps.panelStateStore.set('photos.smartFilter',{on:false,minRating:0,flag:'',label:'',tag:'',camera:''});
   const size=(n:string)=>med.getMedia().items.find(i=>i.name===n)!.size;
   cd.putCaptureDate('strip-1.png',size('strip-1.png'),null,'Canon EOS R5');
   cd.putCaptureDate('strip-2.png',size('strip-2.png'),null,'Sony A7 IV');
   cd.putCaptureDate('strip-3.png',size('strip-3.png'),null,null); // resolved, no camera
  });
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-smart').click();
  await page.getByTestId('photos-smart-camera').selectOption('Canon EOS R5');
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toHaveCount(0);
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toHaveCount(0); // no camera on record: no match
  await page.screenshot({path:`test-results/ds-photos-smart-camera-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-smart-camera').selectOption('');
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toBeVisible();
  await page.getByTestId('photos-filmstrip-smart').click(); // off
  await page.keyboard.press('Escape');
  await page.evaluate(async()=>{const ps=await import('/src/store/panelStateStore.ts');ps.panelStateStore.set('photos.smartFilter',{on:false,minRating:0,flag:'',label:'',tag:'',camera:''});});
 }
});

test('smart filter duplicates: only photos sharing size and dimensions stay (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{
   const ps=await import('/src/store/panelStateStore.ts');const cd=await import('/src/lib/photos/captureDates.ts');const med=await import('/src/lib/media.ts');
   ps.panelStateStore.set('photos.smartFilter',{on:false,minRating:0,flag:'',label:'',tag:'',camera:'',dup:false});
   const src=med.getMedia().items.find(i=>i.name==='strip-1.png')!;
   const blob=await(await fetch(src.url)).blob();
   await med.addMediaFile(new File([blob],'strip-1-copy.png',{type:src.mime}),'strip-1-copy.png'); // true duplicate: same bytes, same size
   const size=(n:string)=>med.getMedia().items.find(i=>i.name===n)!.size;
   cd.putCaptureDate('strip-1.png',size('strip-1.png'),null,null,240,150);
   cd.putCaptureDate('strip-1-copy.png',size('strip-1-copy.png'),null,null,240,150);
   cd.putCaptureDate('strip-2.png',size('strip-2.png'),null,null,240,150); // same dimensions, different bytes: NOT a duplicate
   cd.putCaptureDate('strip-3.png',size('strip-3.png'),null,null,320,200);
  });
  await expect(page.getByTestId('photos-filmstrip-item-strip-1-copy.png')).toBeVisible();
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-smart').click();
  await page.getByTestId('photos-smart-dup').click();
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-1-copy.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toHaveCount(0); // dimensions alone are not enough
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toHaveCount(0);
  await page.screenshot({path:`test-results/ds-photos-smart-dup-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-smart-dup').click(); // off
  await page.getByTestId('photos-filmstrip-smart').click();
  await page.keyboard.press('Escape');
  await page.evaluate(async()=>{
   const ps=await import('/src/store/panelStateStore.ts');const med=await import('/src/lib/media.ts');
   ps.panelStateStore.set('photos.smartFilter',{on:false,minRating:0,flag:'',label:'',tag:'',camera:'',dup:false});
   med.closeMediaForced('strip-1-copy.png'); // the next leg and the next tests expect three photos
  });
  await expect(page.getByTestId('photos-filmstrip-item-strip-1-copy.png')).toHaveCount(0);
 }
});

test('stack survey: compare the members and pick the cover (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const m=await import('/src/lib/photos/stacks.ts');for(const n of['strip-1.png','strip-2.png','strip-3.png']){const id=m.getStack(n);if(id)m.ungroupStacks([id]);}m.groupPhotos(['strip-1.png','strip-2.png','strip-3.png']);}); // stacks persist via localStorage: clean slate, then one stack
  await expect(page.getByTestId('photos-filmstrip-stack-count-strip-1.png')).toHaveText('3'); // default cover: the first member
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-stack-survey').click(); // compare the members side by side
  await expect(page.getByTestId('photos-survey-item-strip-1.png')).toBeVisible();
  await expect(page.getByTestId('photos-survey-item-strip-2.png')).toBeVisible();
  await expect(page.getByTestId('photos-survey-item-strip-3.png')).toBeVisible();
  await page.getByTestId('photos-survey-pick-strip-2.png').click(); // the best shot
  await expect(page.getByTestId('photos-survey')).toHaveCount(0); // closed, strip-2 is active
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-stack-cover').click(); // make it the cover
  await expect(page.getByTestId('photos-filmstrip-stack-count-strip-2.png')).toHaveText('3');
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toHaveCount(0); // old cover back inside the stack
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toHaveCount(0);
  await page.screenshot({path:`test-results/ds-photos-stack-survey-${theme}.png`,fullPage:true});
  await page.evaluate(async()=>{const m=await import('/src/lib/photos/stacks.ts');for(const n of['strip-1.png','strip-2.png','strip-3.png']){const id=m.getStack(n);if(id)m.ungroupStacks([id]);}});
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible();
 }
});
test('collections: a saved view carries the smart filter (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const r=await import('/src/lib/photos/ratings.ts');for(const n of['strip-1.png','strip-2.png','strip-3.png'])r.setRating(n,0);}); // ratings persist via localStorage
  await page.keyboard.press('3'); // strip-1: three stars
  await page.getByTestId('photos-filmstrip-item-strip-2.png').click();
  await page.keyboard.press('4'); // strip-2: four stars, strip-3 stays unrated
  await page.getByTestId('photos-filmstrip-menu').click();
  const smart=page.getByTestId('photos-filmstrip-smart');
  if(await smart.getAttribute('aria-pressed')!=='true')await smart.click(); // persisted panel state
  await page.getByTestId('photos-smart-minrating').selectOption('3');
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toHaveCount(0);
  await page.getByTestId('photos-filmstrip-collection-save').click();
  await page.getByTestId('photos-filmstrip-collection-name').fill('Drei hoch');
  await page.getByTestId('photos-filmstrip-collection-name').press('Enter');
  await smart.click(); // off: everything comes back
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible();
  await page.getByTestId('photos-filmstrip-collections').selectOption('Drei hoch'); // apply: the smart filter comes back too
  await expect(smart).toHaveAttribute('aria-pressed','true');
  await expect(page.getByTestId('photos-smart-minrating')).toHaveValue('3');
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toHaveCount(0);
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toBeVisible();
  await page.screenshot({path:`test-results/ds-photos-smart-collection-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-filmstrip-collection-delete').click(); // the full state matches the set
  await smart.click(); // off again
  await page.evaluate(async()=>{const r=await import('/src/lib/photos/ratings.ts');for(const n of['strip-1.png','strip-2.png','strip-3.png'])r.setRating(n,0);}); // leave no state behind
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible();
 }
});
test('smart filter: unflagged and no-label rules (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const f=await import('/src/lib/photos/flags.ts');const l=await import('/src/lib/photos/labels.ts');for(const n of['strip-1.png','strip-2.png','strip-3.png']){f.setFlag(n,null);l.setLabel(n,null);}f.setFlag('strip-1.png','pick');f.setFlag('strip-2.png','reject');l.setLabel('strip-1.png','red');}); // flags/labels persist via localStorage
  await page.getByTestId('photos-filmstrip-menu').click();
  const smart=page.getByTestId('photos-filmstrip-smart');
  if(await smart.getAttribute('aria-pressed')!=='true')await smart.click(); // persisted panel state
  await page.getByTestId('photos-smart-flag').selectOption('none'); // unflagged only
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toHaveCount(0);
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toHaveCount(0);
  await page.getByTestId('photos-smart-flag').selectOption('');
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toBeVisible();
  await page.getByTestId('photos-smart-label').selectOption('none'); // no color label
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toHaveCount(0); // red
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible();
  await page.screenshot({path:`test-results/ds-photos-smart-none-${theme}.png`,fullPage:true}); // open menu with the ohne rules
  await page.getByTestId('photos-smart-label').selectOption('');
  await smart.click(); // off
  await page.evaluate(async()=>{const f=await import('/src/lib/photos/flags.ts');const l=await import('/src/lib/photos/labels.ts');for(const n of['strip-1.png','strip-2.png','strip-3.png']){f.setFlag(n,null);l.setLabel(n,null);}}); // leave no state behind
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toBeVisible();
 }
});
test('stack cull: cover picked, rest rejected, removal is hide plus undo (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{
   const st=await import('/src/lib/photos/stacks.ts');const f=await import('/src/lib/photos/flags.ts');const h=await import('/src/lib/photos/hidden.ts');
   h.unhideAll();
   for(const n of['strip-1.png','strip-2.png','strip-3.png']){const id=st.getStack(n);if(id)st.ungroupStacks([id]);f.setFlag(n,null);}
   st.groupPhotos(['strip-1.png','strip-2.png','strip-3.png']);
   const id=st.getStack('strip-1.png')!;st.setStackCover(id,'strip-2.png');
  }); // persisted state: clean slate, one stack, strip-2 as cover
  await expect(page.getByTestId('photos-filmstrip-stack-count-strip-2.png')).toHaveText('3');
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-stack-cull').click(); // cover -> pick, the rest -> reject
  await page.getByTestId('photos-filmstrip-menu').click(); // close for a clean strip
  await page.locator('[data-testid^="photos-filmstrip-stack-open-"]').first().click(); // expand inline
  await expect(page.getByTestId('photos-filmstrip-flag-strip-2.png')).toHaveAttribute('data-flag','pick');
  await expect(page.getByTestId('photos-filmstrip-flag-strip-1.png')).toHaveAttribute('data-flag','reject');
  await expect(page.getByTestId('photos-filmstrip-flag-strip-3.png')).toHaveAttribute('data-flag','reject');
  await page.screenshot({path:`test-results/ds-photos-stack-cull-${theme}.png`,fullPage:true});
  const remove=page.getByTestId('photos-filmstrip-remove-rejects');
  await remove.click(); // arms
  await remove.click(); // confirms: hides the rejects, never deletes originals
  await expect(page.getByTestId('photos-position')).toHaveCount(0); // one visible photo: the nav position hides
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toBeVisible(); // the strip stays for the undo path
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-restore-hidden').click(); // the undo path
  await expect(page.getByTestId('photos-filmstrip-stack-count-strip-2.png')).toHaveText('3'); // stack whole again, cover kept
  await page.evaluate(async()=>{
   const st=await import('/src/lib/photos/stacks.ts');const f=await import('/src/lib/photos/flags.ts');
   for(const n of['strip-1.png','strip-2.png','strip-3.png']){const id=st.getStack(n);if(id)st.ungroupStacks([id]);f.setFlag(n,null);}
  }); // leave no state behind
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible();
 }
});
test('hidden review: show hidden, restore one, restore all (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const h=await import('/src/lib/photos/hidden.ts');h.unhideAll();h.hidePhotos(['strip-1.png']);}); // hidden photos persist via localStorage
  await page.getByTestId('photos-filmstrip-menu').click();
  const showBtn=page.getByTestId('photos-filmstrip-show-hidden');
  if(await showBtn.getAttribute('aria-pressed')==='true')await showBtn.click(); // persisted panel state: start hidden-only
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toHaveCount(0);
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toBeVisible();
  await showBtn.click(); // review mode
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-hidden-badge-strip-1.png')).toBeVisible(); // dimmed with marker
  await page.getByTestId('photos-filmstrip-item-strip-1.png').click(); // activate the hidden one
  await page.getByTestId('photos-filmstrip-unhide-active').click(); // single restore
  await expect(page.getByTestId('photos-filmstrip-hidden-badge-strip-1.png')).toHaveCount(0);
  await expect(page.getByTestId('photos-filmstrip-restore-hidden')).toHaveCount(0); // nothing hidden: controls gone
  await page.evaluate(async()=>{const h=await import('/src/lib/photos/hidden.ts');h.hidePhotos(['strip-1.png','strip-2.png']);});
  await expect(page.getByTestId('photos-filmstrip-hidden-badge-strip-1.png')).toBeVisible(); // review mode still on
  await expect(page.getByTestId('photos-filmstrip-hidden-badge-strip-2.png')).toBeVisible();
  await page.screenshot({path:`test-results/ds-photos-hidden-review-${theme}.png`,fullPage:true}); // dimmed thumbs with markers, menu open
  await showBtn.click(); // review mode off again (controls stay: photos are still hidden)
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toHaveCount(0);
  await page.getByTestId('photos-filmstrip-restore-hidden').click(); // all back
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-restore-hidden')).toHaveCount(0);
 }
});
test('virtual copy: independent entry that starts with the source settings (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const r=await import('/src/lib/photos/ratings.ts');for(const n of['strip-1.png','strip-2.png','strip-3.png'])r.setRating(n,0);}); // ratings persist via localStorage
  await page.keyboard.press('4'); // strip-1: four stars
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-virtual-copy').click();
  await expect(page.getByTestId('photos-filmstrip-apply-note')).toContainText('Copy 1');
  await expect(page.getByTestId('photos-filmstrip-item-strip-1 (Copy 1).png')).toBeVisible(); // own strip entry
  await expect(page.getByTestId('photos-name')).toHaveText('strip-1 (Copy 1).png'); // the copy is active
  await expect(page.getByTestId('photos-position')).toHaveText(/\/ 4/); // library grew
  await expect(page.getByTestId('photos-filmstrip-rating-badge-strip-1.png')).toHaveText('4'); // source keeps its rating
  await expect(page.getByTestId('photos-filmstrip-rating-badge-strip-1 (Copy 1).png')).toHaveCount(0); // the copy starts unrated
  await page.keyboard.press('2'); // rate the copy independently
  await expect(page.getByTestId('photos-filmstrip-rating-badge-strip-1 (Copy 1).png')).toHaveText('2');
  await expect(page.getByTestId('photos-filmstrip-rating-badge-strip-1.png')).toHaveText('4'); // source untouched
  await page.screenshot({path:`test-results/ds-photos-virtual-copy-${theme}.png`,fullPage:true});
  await page.evaluate(async()=>{const r=await import('/src/lib/photos/ratings.ts');for(const n of['strip-1.png','strip-2.png','strip-3.png','strip-1 (Copy 1).png'])r.setRating(n,0);}); // leave no state behind
 }
});

test('snapshots: save, apply and delete a named settings snapshot (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const s=await import('/src/lib/photos/snapshots.ts');for(const n of[...s.snapshotsFor('strip-1.png')])s.deleteSnapshot('strip-1.png',n);}); // snapshots persist via localStorage
  await page.evaluate(async()=>{const st=await import('/src/lib/photos/studioSession.ts');st.commitPhotoSettings('strip-1.png',cur=>({...cur,temp:6512}));}); // a known non-neutral setting
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-snapshot-save').click();
  await page.getByTestId('photos-filmstrip-snapshot-name').fill('A');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('photos-filmstrip-apply-note')).toContainText('A'); // snapshot saved
  await page.evaluate(async()=>{const st=await import('/src/lib/photos/studioSession.ts');st.commitPhotoSettings('strip-1.png',cur=>({...cur,temp:6530}));}); // move away from the snapshot
  await page.getByTestId('photos-filmstrip-snapshot-apply-A').click(); // the menu stayed open after saving
  await expect(page.getByTestId('photos-filmstrip-apply-note')).toContainText('A'); // snapshot applied
  const temp=await page.evaluate(async()=>{const st=await import('/src/lib/photos/studioSession.ts');return st.getPhotoSession('strip-1.png')?.now.temp;});
  expect(temp).toBe(6512); // settings jumped back
  await page.screenshot({path:`test-results/ds-photos-snapshots-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-filmstrip-snapshot-delete-A').click(); // still in the open menu
  await expect(page.getByTestId('photos-filmstrip-snapshot-apply-A')).toHaveCount(0); // deleted, row gone
  await page.keyboard.press('Escape');
  await page.evaluate(async()=>{const st=await import('/src/lib/photos/studioSession.ts');st.commitPhotoSettings('strip-1.png',cur=>({...cur,temp:6500}));}); // leave no state behind
 }
});

test('collections: add photos, apply the filter, remove and delete (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const c=await import('/src/lib/photos/collections.ts');for(const n of c.collectionNames())c.deleteCollection(n);}); // collections persist via localStorage
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-collection-add').click();
  await page.getByTestId('photos-filmstrip-collection-name').fill('Favs');
  await page.keyboard.press('Enter'); // active photo joins a new collection, filter applies
  await expect(page.getByTestId('photos-filmstrip-apply-note')).toContainText('Favs');
  await expect(page.getByTestId('photos-filmstrip-collection-apply')).toHaveValue('Favs');
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toBeVisible(); // the member stays
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toHaveCount(0); // non-members leave the strip
  await page.screenshot({path:`test-results/ds-photos-collections-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-filmstrip-collection-drop').click(); // still in the open menu
  await expect(page.getByTestId('photos-filmstrip-collection-apply')).toHaveValue('');
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toBeVisible(); // strip back to full
  await page.keyboard.press('Escape');
 }
});

test('compare: set a reference and survey it against the active photo (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-set-reference').click(); // strip-1 becomes the reference
  await expect(page.getByTestId('photos-filmstrip-apply-note')).toContainText('strip-1.png');
  await page.getByTestId('photos-filmstrip-item-strip-2.png').click(); // make another photo active
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-compare-reference').click();
  await expect(page.getByTestId('photos-survey')).toBeVisible(); // side by side: reference vs active
  await expect(page.getByTestId('photos-survey-item-strip-1.png')).toBeVisible();
  await expect(page.getByTestId('photos-survey-item-strip-2.png')).toBeVisible();
  await page.screenshot({path:`test-results/ds-photos-compare-${theme}.png`,fullPage:true});
  await page.keyboard.press('Escape');
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-clear-reference').click(); // leave no state behind
  await page.keyboard.press('Escape');
 }
});

test('quick develop: paste settings from the previous photo and rotate by 90 degrees (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const p=await import('/src/store/panelStateStore.ts');p.panelStateStore.set('photos.previousPhoto','');}); // panel state persists via localStorage
  await page.evaluate(async()=>{const st=await import('/src/lib/photos/studioSession.ts');st.commitPhotoSettings('strip-1.png',cur=>({...cur,temp:6512}));st.commitPhotoSettings('strip-2.png',cur=>({...cur,temp:6500,orientation:0}));});
  await page.getByTestId('photos-filmstrip-item-strip-2.png').click(); // strip-1 becomes the previous photo
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-paste-previous').click();
  await expect(page.getByTestId('photos-filmstrip-apply-note')).toContainText('strip-1.png');
  const pasted=await page.evaluate(async()=>{const st=await import('/src/lib/photos/studioSession.ts');return st.getPhotoSession('strip-2.png')?.now.temp;});
  expect(pasted).toBe(6512); // one click instead of copy+paste
  await page.getByTestId('photos-filmstrip-rotate-right').click(); // menu stays open
  const turned=await page.evaluate(async()=>{const st=await import('/src/lib/photos/studioSession.ts');return st.getPhotoSession('strip-2.png')?.now.orientation;});
  expect(turned).toBe(1); // one quarter turn clockwise
  await page.screenshot({path:`test-results/ds-photos-quick-develop-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-filmstrip-rotate-left').click(); // and back
  const back=await page.evaluate(async()=>{const st=await import('/src/lib/photos/studioSession.ts');return st.getPhotoSession('strip-2.png')?.now.orientation;});
  expect(back).toBe(0);
  await page.keyboard.press('Escape');
  await page.evaluate(async()=>{const st=await import('/src/lib/photos/studioSession.ts');st.commitPhotoSettings('strip-1.png',cur=>({...cur,temp:6500}));st.commitPhotoSettings('strip-2.png',cur=>({...cur,temp:6500,orientation:0}));const p=await import('/src/store/panelStateStore.ts');p.panelStateStore.set('photos.previousPhoto','');}); // leave no state behind
 }
});

test('before/after split: the strip menu drives the shared workspace split state (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const p=await import('/src/store/panelStateStore.ts');p.panelStateStore.set('photos.split',false);p.panelStateStore.set('photos.splitDir','vertical');}); // panel state persists via localStorage
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-split').click();
  await expect(page.getByTestId('photos-split')).toHaveAttribute('aria-pressed','true'); // the workspace toolbar follows the shared state
  await page.getByTestId('photos-filmstrip-split-dir').click();
  await expect(page.getByTestId('photos-split-dir')).toHaveAttribute('aria-pressed','true'); // horizontal now
  await page.screenshot({path:`test-results/ds-photos-split-strip-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-filmstrip-split').click(); // off again
  await expect(page.getByTestId('photos-split')).toHaveAttribute('aria-pressed','false');
  await page.keyboard.press('Escape');
 }
});

test('photo info: the menu shows dimensions and file size read from the bytes (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-info-toggle').click();
  await expect(page.getByTestId('photos-filmstrip-info')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-info-dimensions')).toHaveText('240 × 150 px'); // from the EXIF cache (which read the PNG IHDR)
  await expect(page.getByTestId('photos-filmstrip-info-size')).toContainText('B'); // file size line joins
  await page.screenshot({path:`test-results/ds-photos-info-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-filmstrip-info-toggle').click(); // close again
  await expect(page.getByTestId('photos-filmstrip-info')).toHaveCount(0);
  await page.keyboard.press('Escape');
 }
});

test('cull undo: Ctrl+Z walks rating, label and caption edits, batch in one step (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{ // culling metadata persists via localStorage: start clean
   const r=await import('/src/lib/photos/ratings.ts');const l=await import('/src/lib/photos/labels.ts');
   for(const n of['strip-1.png','strip-2.png','strip-3.png']){r.setRating(n,0);l.setLabel(n,null);}
  });
  await page.getByTestId('photos-filmstrip-item-strip-1.png').click();
  await page.getByTestId('photos-filmstrip-rating-star-4').click(); // one entry: rate strip-1
  await expect(page.getByTestId('photos-filmstrip-rating-badge-strip-1.png')).toHaveText('4');
  await page.getByTestId('photos-filmstrip-item-strip-2.png').click();
  await page.getByTestId('photos-filmstrip-item-strip-3.png').click({modifiers:['ControlOrMeta']}); // selection: 2+3
  await page.keyboard.press('7'); // one batch entry: yellow on both
  await expect(page.getByTestId('photos-filmstrip-label-strip-2.png')).toHaveAttribute('data-label','yellow');
  await expect(page.getByTestId('photos-filmstrip-label-strip-3.png')).toHaveAttribute('data-label','yellow');
  await page.keyboard.press('Control+z'); // one step undoes the whole batch
  await expect(page.getByTestId('photos-filmstrip-label-strip-2.png')).toHaveCount(0);
  await expect(page.getByTestId('photos-filmstrip-label-strip-3.png')).toHaveCount(0);
  await expect(page.getByTestId('photos-filmstrip-rating-badge-strip-1.png')).toHaveText('4'); // the earlier edit survives
  await page.keyboard.press('Control+z'); // second step undoes the rating
  await expect(page.getByTestId('photos-filmstrip-rating-badge-strip-1.png')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+Z'); // redo the rating
  await expect(page.getByTestId('photos-filmstrip-rating-badge-strip-1.png')).toHaveText('4');
  await page.screenshot({path:`test-results/ds-photos-cull-undo-${theme}.png`,fullPage:true});
  await page.evaluate(async()=>{const r=await import('/src/lib/photos/ratings.ts');r.setRating('strip-1.png',0);}); // cleanup between the legs
 }
});

test('metadata clipboard: copy from the active photo, paste onto a selection (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await page.getByTestId('photos-filmstrip-item-strip-1.png').click();
  const srcBadge=page.getByTestId('photos-filmstrip-rating-badge-strip-1.png');
  if((await srcBadge.count())===0||(await srcBadge.textContent())!=='4')await page.getByTestId('photos-filmstrip-rating-star-4').click(); // source: 4 stars (rating persists across the two theme legs)
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-metadata-copy').click();
  await expect(page.getByTestId('photos-filmstrip-apply-note')).toContainText('strip-1.png');
  await page.keyboard.press('Escape');
  await page.getByTestId('photos-filmstrip-item-strip-2.png').click();
  await page.getByTestId('photos-filmstrip-item-strip-3.png').click({modifiers:['ControlOrMeta']}); // selection: 2+3
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-metadata-paste').click();
  await expect(page.getByTestId('photos-filmstrip-apply-note')).toContainText('2');
  await page.screenshot({path:`test-results/ds-photos-metadata-${theme}.png`,fullPage:true});
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('photos-filmstrip-rating-badge-strip-2.png')).toHaveText('4');
  await expect(page.getByTestId('photos-filmstrip-rating-badge-strip-3.png')).toHaveText('4');
  if(theme==='dark'){ // cleanup once, after both legs
   await page.getByTestId('photos-filmstrip-item-strip-1.png').click();
   await page.getByTestId('photos-filmstrip-rating-star-4').click(); // toggle off
   for(const n of['2','3']){
    await page.getByTestId(`photos-filmstrip-item-strip-${n}.png`).click();
    await page.getByTestId('photos-filmstrip-rating-star-4').click();
   }
   await expect(page.getByTestId('photos-filmstrip-rating-badge-strip-2.png')).toHaveCount(0);
  }
 }
});

test('caption: per-photo text persists and the search matches it (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively - settle before the menu opens
  await page.getByTestId('photos-filmstrip-item-strip-1.png').click(); // pin the active photo: the caption must land on strip-1
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-caption').fill('Golden hour at the lake');
  await page.screenshot({path:`test-results/ds-photos-caption-${theme}.png`,fullPage:true});
  await page.keyboard.press('Escape');
  await page.getByTestId('photos-filmstrip-search').fill('golden hour');
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toHaveCount(0);
  await page.getByTestId('photos-filmstrip-search').fill('');
  if(theme==='dark'){ // cleanup once, after both legs
   await page.getByTestId('photos-filmstrip-menu').click();
   await page.getByTestId('photos-filmstrip-caption').fill('');
   await page.keyboard.press('Escape');
   await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toBeVisible();
  }
 }
});

test('slideshow: autoplay advances through the filtered view on the chosen tempo (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const p=await import('/src/store/panelStateStore.ts');p.panelStateStore.set('photos.slideshow',false);p.panelStateStore.set('photos.slideshowMs',300);}); // panel state persists; fast tempo for the proof
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-slideshow').click();
  await expect(page.getByTestId('photos-filmstrip-slideshow')).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('Escape'); // the show runs with the menu closed
  await page.waitForTimeout(700);
  const moved=await page.evaluate(()=>document.querySelector('[data-testid="photos-name"]')?.textContent??'');
  expect(moved.startsWith('strip-1.png')).toBe(false); // advanced past the first photo
  await page.waitForTimeout(500);
  const moved2=await page.evaluate(()=>document.querySelector('[data-testid="photos-name"]')?.textContent??'');
  expect(moved2).not.toBe(moved); // keeps looping
  await page.screenshot({path:`test-results/ds-photos-slideshow-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-slideshow').click(); // stop
  await page.keyboard.press('Escape');
  const stopped=await page.evaluate(()=>document.querySelector('[data-testid="photos-name"]')?.textContent??'');
  await page.waitForTimeout(600);
  expect(await page.evaluate(()=>document.querySelector('[data-testid="photos-name"]')?.textContent??'')).toBe(stopped); // parked
  await page.evaluate(async()=>{const p=await import('/src/store/panelStateStore.ts');p.panelStateStore.set('photos.slideshow',false);p.panelStateStore.set('photos.slideshowMs',4000);}); // leave no state behind
 }
});

test('keyboard reference: opens from the menu and the ? key, lists the wired shortcuts (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const p=await import('/src/store/panelStateStore.ts');p.panelStateStore.set('photos.shortcuts',false);}); // panel state persists via localStorage
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-shortcuts').click();
  await expect(page.getByTestId('photos-shortcuts')).toBeVisible();
  await expect(page.getByTestId('photos-shortcuts-row-stars')).toContainText('0'); // the wired 0-5 rating row
  await expect(page.getByTestId('photos-shortcuts-row-lightsOut')).toContainText('L');
  await page.keyboard.press('Escape'); // dialog closes
  await expect(page.getByTestId('photos-shortcuts')).toHaveCount(0);
  await page.keyboard.press('?'); // same overlay via the key
  await expect(page.getByTestId('photos-shortcuts')).toBeVisible();
  await page.screenshot({path:`test-results/ds-photos-shortcuts-${theme}.png`,fullPage:true});
  await page.keyboard.press('?');
  await expect(page.getByTestId('photos-shortcuts')).toHaveCount(0);
 }
});

test('statistics: rating, flag and hidden counts over the library (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const r=await import('/src/lib/photos/ratings.ts');const f=await import('/src/lib/photos/flags.ts');for(const n of['strip-1.png','strip-2.png','strip-3.png']){r.setRating(n,0);f.setFlag(n,null);}}); // ratings and flags persist via localStorage
  await page.keyboard.press('4'); // strip-1: four stars
  await page.getByTestId('photos-filmstrip-item-strip-2.png').click();
  await page.keyboard.press('p'); // strip-2: pick
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-stats').click();
  await expect(page.getByTestId('photos-filmstrip-stats-visible')).toContainText('3'); // shown of total
  await expect(page.getByTestId('photos-filmstrip-stats-ratings')).toContainText('4★ ×1');
  await expect(page.getByTestId('photos-filmstrip-stats-ratings')).toContainText('×2'); // two unrated
  await expect(page.getByTestId('photos-filmstrip-stats-flags')).toContainText('×1'); // one pick
  await page.screenshot({path:`test-results/ds-photos-stats-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-filmstrip-stats').click(); // close again
  await expect(page.getByTestId('photos-filmstrip-stats-panel')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.evaluate(async()=>{const r=await import('/src/lib/photos/ratings.ts');const f=await import('/src/lib/photos/flags.ts');for(const n of['strip-1.png','strip-2.png','strip-3.png']){r.setRating(n,0);f.setFlag(n,null);}}); // leave no state behind
 }
});

test('smart filter type: narrows the strip to the chosen file type (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{
   const ps=await import('/src/store/panelStateStore.ts');const med=await import('/src/lib/media.ts');
   ps.panelStateStore.set('photos.smartFilter',{on:false,minRating:0,flag:'',label:'',tag:'',camera:'',dup:false,type:''});
   if(!med.getMedia().items.some(i=>i.name==='scan.jpg')){ // a real JPEG next to the three PNGs
    const c=document.createElement('canvas');c.width=64;c.height=48;const x=c.getContext('2d')!;x.fillStyle='rgb(90,120,160)';x.fillRect(0,0,64,48);
    const blob=await new Promise<Blob>((res,rej)=>c.toBlob(v=>v?res(v):rej(Error('toBlob failed')),'image/jpeg'));
    await med.addMediaFile(new File([blob],'scan.jpg',{type:'image/jpeg'}),'scan.jpg');
   }
  });
  await expect(page.getByTestId('photos-filmstrip-item-scan.jpg')).toBeVisible();
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-smart').click();
  await page.getByTestId('photos-smart-type').selectOption('jpeg');
  await expect(page.getByTestId('photos-filmstrip-item-scan.jpg')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toHaveCount(0);
  await page.getByTestId('photos-smart-type').selectOption('png');
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-scan.jpg')).toHaveCount(0);
  await page.screenshot({path:`test-results/ds-photos-smart-type-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-smart-type').selectOption(''); // off
  await page.getByTestId('photos-filmstrip-smart').click();
  await page.keyboard.press('Escape');
  await page.evaluate(async()=>{
   const ps=await import('/src/store/panelStateStore.ts');const med=await import('/src/lib/media.ts');
   ps.panelStateStore.set('photos.smartFilter',{on:false,minRating:0,flag:'',label:'',tag:'',camera:'',dup:false,type:''});
   med.closeMediaForced('scan.jpg'); // the next tests expect three photos
  });
  await expect(page.getByTestId('photos-filmstrip-item-scan.jpg')).toHaveCount(0);
 }
});
test('sort by name and size: the strip reorders, duplicates land side by side (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  const items=page.locator('[data-testid^="photos-filmstrip-item-"]');
  await page.evaluate(async()=>{
   const ps=await import('/src/store/panelStateStore.ts');const med=await import('/src/lib/media.ts');
   ps.panelStateStore.set('photos.filmstripSort','library');
   const png=async(w:number,h:number,seed:number)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d')!;const d=x.createImageData(w,h);for(let i=0;i<d.data.length;i++)d.data[i]=(i*seed)%256;x.putImageData(d,0,0);return new Promise<Blob>((res,rej)=>c.toBlob(v=>v?res(v):rej(Error('toBlob failed')),'image/png'));};
   if(!med.getMedia().items.some(i=>i.name==='aaa-small.png'))await med.addMediaFile(new File([await png(8,8,7)],'aaa-small.png',{type:'image/png'}),'aaa-small.png');
   if(!med.getMedia().items.some(i=>i.name==='zzz-big.png'))await med.addMediaFile(new File([await png(400,300,13)],'zzz-big.png',{type:'image/png'}),'zzz-big.png'); // bigger than any strip
   med.setActiveMedia('strip-1.png');
  });
  await expect(page.getByTestId('photos-filmstrip-item-zzz-big.png')).toBeVisible();
  await expect(items.first()).toHaveAttribute('data-testid','photos-filmstrip-item-strip-1.png'); // library order
  await page.getByTestId('photos-filmstrip-sort').selectOption('name');
  await expect(items.first()).toHaveAttribute('data-testid','photos-filmstrip-item-aaa-small.png');
  await page.getByTestId('photos-filmstrip-sort').selectOption('size');
  await expect(items.first()).toHaveAttribute('data-testid','photos-filmstrip-item-zzz-big.png'); // big first
  await page.screenshot({path:`test-results/ds-photos-sort-size-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-filmstrip-sort').selectOption('library');
  await page.evaluate(async()=>{
   const ps=await import('/src/store/panelStateStore.ts');const med=await import('/src/lib/media.ts');
   ps.panelStateStore.set('photos.filmstripSort','library');
   med.closeMediaForced('aaa-small.png');med.closeMediaForced('zzz-big.png');med.setActiveMedia('strip-1.png'); // the next tests expect three photos
  });
  await expect(page.getByTestId('photos-filmstrip-item-zzz-big.png')).toHaveCount(0);
 }
});
test('thumbnail tooltip: name, capture date, camera and dimensions from the EXIF cache (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{
   const cd=await import('/src/lib/photos/captureDates.ts');const med=await import('/src/lib/media.ts');
   const size=(n:string)=>med.getMedia().items.find(i=>i.name===n)!.size;
   cd.putCaptureDate('strip-1.png',size('strip-1.png'),new Date('2026-06-01T10:30:00Z').getTime(),'Canon EOS R5',240,150);
  });
  const tip=await page.getByTestId('photos-filmstrip-item-strip-1.png').getAttribute('title');
  expect(tip).toContain('strip-1.png');
  expect(tip).toContain('Canon EOS R5');
  expect(tip).toContain('240 × 150');
  expect(tip).toContain('2026'); // locale-formatted capture date, any locale
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toHaveAttribute('title','strip-2.png · 240 × 150'); // real decoded dimensions, no invented date or camera
 }
});
test('library search: camera from the EXIF cache narrows the strip (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{
   const cd=await import('/src/lib/photos/captureDates.ts');const med=await import('/src/lib/media.ts');
   const size=(n:string)=>med.getMedia().items.find(i=>i.name===n)!.size;
   cd.putCaptureDate('strip-2.png',size('strip-2.png'),null,'Nikon Z6',240,150);
  });
  const search=page.getByTestId('photos-filmstrip-search');
  await search.fill('');
  await search.fill('nikon'); // case-insensitive camera match
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toHaveCount(0);
  await page.screenshot({path:`test-results/ds-photos-search-camera-${theme}.png`,fullPage:true});
  await search.fill('');
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible();
 }
});
test('smart filter orientation: narrows the strip to portrait or landscape (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{
   const ps=await import('/src/store/panelStateStore.ts');const cd=await import('/src/lib/photos/captureDates.ts');const med=await import('/src/lib/media.ts');
   ps.panelStateStore.set('photos.smartFilter',{on:false,minRating:0,flag:'',label:'',tag:'',camera:'',dup:false,type:'',orient:''});
   if(!med.getMedia().items.some(i=>i.name==='square.png')){ // a real square photo: proves the square rule the gallery lacked
    const c=document.createElement('canvas');c.width=200;c.height=200;const x=c.getContext('2d')!;const d=x.createImageData(200,200);for(let i=0;i<d.data.length;i++)d.data[i]=(i*7)%256;x.putImageData(d,0,0);
    const blob=await new Promise<Blob>((res,rej)=>c.toBlob(v=>v?res(v):rej(Error('toBlob failed')),'image/png'));
    await med.addMediaFile(new File([blob],'square.png',{type:'image/png'}),'square.png');
   }
   if(!med.getMedia().items.some(i=>i.name==='tall.png')){ // a real portrait photo next to the three landscape strips
    const c=document.createElement('canvas');c.width=150;c.height=240;const x=c.getContext('2d')!;const d=x.createImageData(150,240);for(let i=0;i<d.data.length;i++)d.data[i]=(i*11)%256;x.putImageData(d,0,0);
    const blob=await new Promise<Blob>((res,rej)=>c.toBlob(v=>v?res(v):rej(Error('toBlob failed')),'image/png'));
    await med.addMediaFile(new File([blob],'tall.png',{type:'image/png'}),'tall.png');
   }
   const size=(n:string)=>med.getMedia().items.find(i=>i.name===n)!.size;
   for(const n of['strip-1.png','strip-2.png','strip-3.png'])cd.putCaptureDate(n,size(n),null,null,240,150);
   cd.putCaptureDate('tall.png',size('tall.png'),null,null,150,240);
   cd.putCaptureDate('square.png',size('square.png'),null,null,200,200);
   med.setActiveMedia('strip-1.png');
  });
  await expect(page.getByTestId('photos-filmstrip-item-tall.png')).toBeVisible();
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-smart').click();
  await page.getByTestId('photos-smart-orient').selectOption('portrait');
  await expect(page.getByTestId('photos-filmstrip-item-tall.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toHaveCount(0);
  await page.getByTestId('photos-smart-orient').selectOption('landscape');
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-tall.png')).toHaveCount(0);
  await page.getByTestId('photos-smart-orient').selectOption('square');
  await expect(page.getByTestId('photos-filmstrip-item-square.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toHaveCount(0);
  await expect(page.getByTestId('photos-filmstrip-item-tall.png')).toHaveCount(0);
  await page.screenshot({path:`test-results/ds-photos-smart-orient-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-smart-orient').selectOption(''); // off
  await page.getByTestId('photos-filmstrip-smart').click();
  await page.keyboard.press('Escape');
  await page.evaluate(async()=>{
   const ps=await import('/src/store/panelStateStore.ts');const med=await import('/src/lib/media.ts');
   ps.panelStateStore.set('photos.smartFilter',{on:false,minRating:0,flag:'',label:'',tag:'',camera:'',dup:false,type:'',orient:''});
   med.closeMediaForced('tall.png');med.closeMediaForced('square.png');med.setActiveMedia('strip-1.png'); // the next tests expect three photos
  });
  await expect(page.getByTestId('photos-filmstrip-item-tall.png')).toHaveCount(0);
 }
});
test('keyboard: Ctrl+A selects the visible strip, editable targets keep native select-all (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const ps=await import('/src/store/panelStateStore.ts');ps.panelStateStore.set('photos.filmstripSelection',[]);}); // selection persists via localStorage
  await page.keyboard.press('Control+a'); // body focus: selects the whole visible strip
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toHaveAttribute('data-selected','true');
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toHaveAttribute('data-selected','true');
  await page.screenshot({path:`test-results/ds-photos-ctrl-a-${theme}.png`,fullPage:true});
  await page.evaluate(async()=>{const ps=await import('/src/store/panelStateStore.ts');ps.panelStateStore.set('photos.filmstripSelection',[]);});
  await page.getByTestId('photos-filmstrip-search').click();
  await page.keyboard.press('Control+a'); // inside the search input: native select-all, no strip selection
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).not.toHaveAttribute('data-selected','true');
  await page.keyboard.press('Escape');
 }
});
test('library search: ISO capture date narrows the strip (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{
   const cd=await import('/src/lib/photos/captureDates.ts');const med=await import('/src/lib/media.ts');
   const size=(n:string)=>med.getMedia().items.find(i=>i.name===n)!.size;
   cd.putCaptureDate('strip-2.png',size('strip-2.png'),new Date(2026,5,14,12,0,0).getTime(),null,240,150); // 2026-06-14 local
  });
  const search=page.getByTestId('photos-filmstrip-search');
  await search.fill('');
  await search.fill('2026-06'); // year-month match
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toHaveCount(0); // undated photos never match a date query
  await search.fill('2026-06-14'); // exact day
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toBeVisible();
  await search.fill('2026-06-15'); // the day after
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toHaveCount(0);
  await page.screenshot({path:`test-results/ds-photos-search-date-${theme}.png`,fullPage:true});
  await search.fill('');
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible();
 }
});
test('thumbnail tooltip: exposure line from the v4 EXIF cache (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{
   const cd=await import('/src/lib/photos/captureDates.ts');const med=await import('/src/lib/media.ts');
   const size=(n:string)=>med.getMedia().items.find(i=>i.name===n)!.size;
   cd.putCaptureDate('strip-1.png',size('strip-1.png'),null,'Canon EOS R5',240,150,{lens:'RF 35mm F1.8',exp:'1/125',ap:'f/2.8',iso:200,fl:'35 mm'});
  });
  const tip=await page.getByTestId('photos-filmstrip-item-strip-1.png').getAttribute('title');
  expect(tip).toContain('Canon EOS R5');
  expect(tip).toContain('1/125 · f/2.8 · ISO 200 · 35 mm'); // the exposure scan line
  expect(tip).toContain('240 × 150');
  const tip2=await page.getByTestId('photos-filmstrip-item-strip-2.png').getAttribute('title');
  expect(tip2).not.toContain('ISO'); // no cache entry: nothing invented
 }
});
test('smart filter ISO: narrows the strip to the chosen ISO (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{
   const ps=await import('/src/store/panelStateStore.ts');const cd=await import('/src/lib/photos/captureDates.ts');const med=await import('/src/lib/media.ts');
   ps.panelStateStore.set('photos.smartFilter',{on:false,minRating:0,flag:'',label:'',tag:'',camera:'',dup:false,type:'',orient:'',iso:''});
   const size=(n:string)=>med.getMedia().items.find(i=>i.name===n)!.size;
   cd.putCaptureDate('strip-1.png',size('strip-1.png'),null,null,240,150,{iso:200});
   cd.putCaptureDate('strip-2.png',size('strip-2.png'),null,null,240,150,{iso:6400});
  });
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-smart').click();
  await expect(page.getByTestId('photos-smart-iso').locator('option', {hasText:'ISO 6400'})).toHaveCount(1); // options come from the cache
  await page.getByTestId('photos-smart-iso').selectOption('6400');
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toHaveCount(0);
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toHaveCount(0); // unresolved entry never matches
  await page.screenshot({path:`test-results/ds-photos-smart-iso-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-smart-iso').selectOption(''); // off
  await page.getByTestId('photos-filmstrip-smart').click();
  await page.keyboard.press('Escape');
  await page.evaluate(async()=>{const ps=await import('/src/store/panelStateStore.ts');ps.panelStateStore.set('photos.smartFilter',{on:false,minRating:0,flag:'',label:'',tag:'',camera:'',dup:false,type:'',orient:'',iso:''});});
 }
});
test('smart filter focal length: narrows the strip to the chosen focal length (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{
   const ps=await import('/src/store/panelStateStore.ts');const cd=await import('/src/lib/photos/captureDates.ts');const med=await import('/src/lib/media.ts');
   ps.panelStateStore.set('photos.smartFilter',{on:false,minRating:0,flag:'',label:'',tag:'',camera:'',dup:false,type:'',orient:'',iso:'',fl:''});
   const size=(n:string)=>med.getMedia().items.find(i=>i.name===n)!.size;
   cd.putCaptureDate('strip-1.png',size('strip-1.png'),null,null,240,150,{fl:'24 mm'});
   cd.putCaptureDate('strip-2.png',size('strip-2.png'),null,null,240,150,{fl:'85 mm'});
  });
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-smart').click();
  await expect(page.getByTestId('photos-smart-fl').locator('option', {hasText:'85 mm'})).toHaveCount(1); // options come from the cache
  await page.getByTestId('photos-smart-fl').selectOption('85 mm');
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toHaveCount(0);
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toHaveCount(0); // unresolved entry never matches
  await page.screenshot({path:`test-results/ds-photos-smart-fl-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-smart-fl').selectOption(''); // off
  await page.getByTestId('photos-filmstrip-smart').click();
  await page.keyboard.press('Escape');
  await page.evaluate(async()=>{const ps=await import('/src/store/panelStateStore.ts');ps.panelStateStore.set('photos.smartFilter',{on:false,minRating:0,flag:'',label:'',tag:'',camera:'',dup:false,type:'',orient:'',iso:'',fl:''});});
 }
});
test('info panel: reads the EXIF cache, no second fetch (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  const fetches:string[]=[];
  await page.route('**/*',r=>{if(r.request().resourceType()==='fetch')fetches.push(r.request().url());void r.continue();});
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.waitForFunction(async()=>{ // the warm-up pump settled: every strip photo has a cache entry
   const cd=await import('/src/lib/photos/captureDates.ts');const med=await import('/src/lib/media.ts');
   return ['strip-1.png','strip-2.png','strip-3.png'].every(n=>{const i=med.getMedia().items.find(x=>x.name===n);return !i||cd.getCaptureEntry(i.name,i.size)!==null;});
  });
  await page.evaluate(async()=>{ // cache-only values: the fixture bytes carry no such EXIF
   const cd=await import('/src/lib/photos/captureDates.ts');const med=await import('/src/lib/media.ts');
   const size=(n:string)=>med.getMedia().items.find(i=>i.name===n)!.size;
   cd.putCaptureDate('strip-1.png',size('strip-1.png'),null,'Dedupe Cam',240,150,{iso:777,fl:'123 mm'});
  });
  fetches.length=0; // count only what opening the panel triggers
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-info-toggle').click();
  await expect(page.getByTestId('photos-filmstrip-info-camera')).toHaveText('Dedupe Cam');
  await expect(page.getByTestId('photos-filmstrip-info-exposure')).toContainText('ISO 777');
  await expect(page.getByTestId('photos-filmstrip-info-exposure')).toContainText('123 mm');
  expect(fetches.filter(u=>u.includes('strip-1.png'))).toHaveLength(0); // no second fetch for the open panel
  await page.screenshot({path:`test-results/ds-photos-info-cache-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-filmstrip-info-toggle').click(); // close again
  await page.keyboard.press('Escape');
 }
});
test('smart filter lens, aperture and shutter: the exposure rules narrow the strip (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{
   const ps=await import('/src/store/panelStateStore.ts');const cd=await import('/src/lib/photos/captureDates.ts');const med=await import('/src/lib/media.ts');
   ps.panelStateStore.set('photos.smartFilter',{on:false,minRating:0,flag:'',label:'',tag:'',camera:'',dup:false,type:'',orient:'',iso:'',fl:'',lens:'',ap:'',exp:''});
   const size=(n:string)=>med.getMedia().items.find(i=>i.name===n)!.size;
   cd.putCaptureDate('strip-1.png',size('strip-1.png'),null,null,240,150,{lens:'Lens Alpha',ap:'f/1.4',exp:'1/500 s'});
   cd.putCaptureDate('strip-2.png',size('strip-2.png'),null,null,240,150,{lens:'Lens Beta',ap:'f/8',exp:'1/15 s'});
  });
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-smart').click();
  await expect(page.getByTestId('photos-smart-lens').locator('option',{hasText:'Lens Beta'})).toHaveCount(1); // options come from the cache
  await expect(page.getByTestId('photos-smart-aperture').locator('option',{hasText:'f/1.4'})).toHaveCount(1);
  await expect(page.getByTestId('photos-smart-shutter').locator('option',{hasText:'1/15 s'})).toHaveCount(1);
  await page.getByTestId('photos-smart-lens').selectOption('Lens Beta');
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toHaveCount(0);
  await page.getByTestId('photos-smart-lens').selectOption(''); // off
  await page.getByTestId('photos-smart-aperture').selectOption('f/1.4');
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toHaveCount(0);
  await page.getByTestId('photos-smart-aperture').selectOption('');
  await page.getByTestId('photos-smart-shutter').selectOption('1/15 s');
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toHaveCount(0);
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toHaveCount(0); // unresolved entry never matches
  await page.screenshot({path:`test-results/ds-photos-smart-exposure-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-smart-shutter').selectOption(''); // off
  await page.getByTestId('photos-filmstrip-smart').click();
  await page.keyboard.press('Escape');
  await page.evaluate(async()=>{const ps=await import('/src/store/panelStateStore.ts');ps.panelStateStore.set('photos.smartFilter',{on:false,minRating:0,flag:'',label:'',tag:'',camera:'',dup:false,type:'',orient:'',iso:'',fl:'',lens:'',ap:'',exp:''});});
 }
});
test('collections: views differing only in a newer smart rule stay distinct (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const ps=await import('/src/store/panelStateStore.ts');ps.panelStateStore.set('photos.filterSets',{});ps.panelStateStore.set('photos.smartFilter',{on:false,minRating:0,flag:'',label:'',tag:'',camera:'',dup:false,type:'',orient:'',iso:'',fl:'',lens:'',ap:'',exp:''});}); // clean slate: panel state persists across the theme loop
  await page.getByTestId('photos-filmstrip-menu').click();
  const smart=page.getByTestId('photos-filmstrip-smart');
  if(await smart.getAttribute('aria-pressed')!=='true')await smart.click(); // persisted panel state
  await page.getByTestId('photos-filmstrip-collection-save').click(); // first saved: everything off (legacy fields identical to the next one)
  await page.getByTestId('photos-filmstrip-collection-name').fill('Alles');
  await page.getByTestId('photos-filmstrip-collection-name').press('Enter');
  await page.getByTestId('photos-smart-type').selectOption('png'); // second saved: differs only in the file-type rule, no legacy field changes
  await page.getByTestId('photos-filmstrip-collection-save').click();
  await page.getByTestId('photos-filmstrip-collection-name').fill('Nur PNG');
  await page.getByTestId('photos-filmstrip-collection-name').press('Enter');
  await page.getByTestId('photos-smart-type').selectOption(''); // back off, then apply 'Nur PNG' again
  await page.getByTestId('photos-filmstrip-collections').selectOption('Nur PNG');
  await expect(page.getByTestId('photos-smart-type')).toHaveValue('png');
  await page.getByTestId('photos-filmstrip-collection-delete').click(); // must delete the applied view, not the legacy-equal first one
  await expect(page.getByTestId('photos-filmstrip-collections').locator('option',{hasText:'Alles'})).toHaveCount(1);
  await expect(page.getByTestId('photos-filmstrip-collections').locator('option',{hasText:'Nur PNG'})).toHaveCount(0);
  await page.screenshot({path:`test-results/ds-photos-collection-distinct-${theme}.png`,fullPage:true});
  await smart.click(); // off
  await page.keyboard.press('Escape');
  await page.evaluate(async()=>{const ps=await import('/src/store/panelStateStore.ts');ps.panelStateStore.set('photos.filterSets',{});ps.panelStateStore.set('photos.smartFilter',{on:false,minRating:0,flag:'',label:'',tag:'',camera:'',dup:false,type:'',orient:'',iso:'',fl:'',lens:'',ap:'',exp:''});}); // leave no state behind
 }
});
test('search: lens name and exposure line join the query (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{
   const cd=await import('/src/lib/photos/captureDates.ts');const med=await import('/src/lib/media.ts');
   const size=(n:string)=>med.getMedia().items.find(i=>i.name===n)!.size;
   cd.putCaptureDate('strip-1.png',size('strip-1.png'),null,null,240,150,{lens:'Prime 35',exp:'1/500 s',ap:'f/1.4',iso:200,fl:'35 mm'});
   cd.putCaptureDate('strip-2.png',size('strip-2.png'),null,null,240,150,{lens:'Zoom 70-200',exp:'1/15 s',ap:'f/8',iso:6400,fl:'85 mm'});
  });
  await page.getByTestId('photos-filmstrip-search').fill('prime'); // lens name, case-insensitive
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toHaveCount(0);
  await page.getByTestId('photos-filmstrip-search').fill('f/8'); // aperture from the exposure line
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toHaveCount(0);
  await page.getByTestId('photos-filmstrip-search').fill('iso 200'); // ISO from the exposure line
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toHaveCount(0);
  await page.getByTestId('photos-filmstrip-search').fill('85 mm'); // focal length from the exposure line
  await expect(page.getByTestId('photos-filmstrip-item-strip-2.png')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toHaveCount(0); // unresolved entry never matches
  await page.screenshot({path:`test-results/ds-photos-search-exif-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-filmstrip-search').fill(''); // off
 }
});
test('caption surfaces: thumb tooltip and the info popover show it (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const ch=await import('/src/lib/photos/cullHistory.ts');ch.cullSetCaption('strip-1.png','Morgennebel am See');});
  await expect(page.getByTestId('photos-filmstrip-item-strip-1.png')).toHaveAttribute('title',/Morgennebel am See/); // tooltip leads with the user's words
  await page.getByTestId('photos-filmstrip-menu').click();
  await page.getByTestId('photos-filmstrip-info-toggle').click();
  await expect(page.getByTestId('photos-filmstrip-info-caption')).toHaveText('Morgennebel am See');
  await page.screenshot({path:`test-results/ds-photos-caption-surfaces-${theme}.png`,fullPage:true});
  await page.getByTestId('photos-filmstrip-info-toggle').click(); // close again
  await page.keyboard.press('Escape');
  await page.evaluate(async()=>{const c=await import('/src/lib/photos/captions.ts');c.setCaption('strip-1.png','');}); // leave no state behind
 }
});
test('menu groups: labeled collapsible sections, expanded by default (light and dark)',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-filmstrip');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-workspace')).toBeVisible();
  await expect(page.getByTestId('photos-filmstrip-item-strip-3.png')).toBeVisible(); // media added progressively
  await page.evaluate(async()=>{const p=await import('/src/store/panelStateStore.ts');for(const g of['filter','view','edit','collections','info'])p.panelStateStore.set(`photos.menuGroup.${g}`,false);}); // group state persists via localStorage
  await page.getByTestId('photos-filmstrip-menu').click();
  for(const g of['filter','view','edit','collections','info'])await expect(page.getByTestId(`photos-filmstrip-group-${g}`)).toHaveAttribute('aria-expanded','true');
  await expect(page.getByTestId('photos-filmstrip-split')).toBeVisible(); // controls reachable without extra clicks
  await page.getByTestId('photos-filmstrip-group-view').click(); // collapse
  await expect(page.getByTestId('photos-filmstrip-split')).toHaveCount(0);
  await page.getByTestId('photos-filmstrip-group-view').click(); // expand again
  await expect(page.getByTestId('photos-filmstrip-split')).toBeVisible();
  await page.screenshot({path:`test-results/ds-photos-menu-groups-${theme}.png`,fullPage:true});
  await page.keyboard.press('Escape');
 }
});
