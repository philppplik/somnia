import {test,expect} from './fixtures';

// Stage A visual acceptance: multitrack arrange view + mixer/automation surfaces.
// The arrangement document is seeded through the real store API (editArrangement),
// so the test needs no WASM engine decode and runs without the built engine.
test('Sound Stage A: arrange view renders multitrack session with mixer and automation surfaces',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.getByRole('radio',{name:'Somnia Sound'}).click();
 await expect(page.getByTestId('sound-start')).toBeVisible();
 await page.getByTestId('sound-create-blank').click();
 await expect(page.getByTestId('sound-workspace')).toBeVisible({timeout:20000});
 // switch to the arrange view (multitrack)
 await page.getByRole('button',{name:/Arrange|Anordnen/i}).click();
 await expect(page.getByTestId('sound-arrange')).toBeVisible();
 // seed a one-track session with one clip through the real store API
 await page.evaluate(async()=>{
  const store:any=await import('/src/lib/sound/arrangeStore.ts');
  const arr:any=await import('/src/lib/sound/arrangement.ts');
  store.editArrangement((s:any)=>{
   const source={id:'seed-src',name:'Untitled.wav',frames:288000,sampleRate:48000,channels:2};
   s.sources.push(source);
   const track=arr.newTrack('seed-track','Untitled.wav');
   track.clips.push(arr.newClip('seed-clip',source));
   s.tracks.push(track);
  });
 });
 // clip and mixer/automation surfaces of Stage A
 await expect(page.getByTestId('arrange-clip').first()).toBeVisible();
 await expect(page.getByTestId('sound-arrange-track-curve-toggle').first()).toBeVisible();
 await expect(page.getByTestId('sound-arrange-master-curve-toggle')).toBeVisible();
 // track automation open: pan mode = mixer element
 await page.getByTestId('sound-arrange-track-curve-toggle').first().evaluate(el=>(el as HTMLElement).click());
 await expect(page.getByTestId('sound-arrange-track-curve')).toBeVisible();
 await page.getByTestId('sound-arrange-track-curve-mode-pan').click();
 await expect(page.getByTestId('sound-arrange-track-curve-mode-pan')).toHaveAttribute('aria-pressed','true');
 // master automation lane
 await page.getByTestId('sound-arrange-master-curve-toggle').evaluate(el=>(el as HTMLElement).click());
 await expect(page.getByTestId('sound-arrange-master-curve')).toBeVisible();
 await page.screenshot({path:'test-results/sound-stage-a-arrange.png',fullPage:false});
});
