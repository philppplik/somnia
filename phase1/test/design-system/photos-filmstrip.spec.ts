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
  await expect(page.getByTestId('photos-position')).toHaveText(/\/ 2/); // library shrank
  await expect(remove).toHaveCount(0); // no rejects left: button gone
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
