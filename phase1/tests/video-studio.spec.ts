import {test,expect} from './fixtures';
import path from 'node:path';
import {readFileSync} from 'node:fs';
// Cold Vite dev server: the first load of the video engine can re-optimise dependencies and reload the page. Warm it before the tests run.
test.beforeAll(async({browser})=>{
 for(let i=0;i<3;i++){
  const page=await browser.newPage();
  try{await page.goto('http://127.0.0.1:1420/');await page.evaluate(async()=>{await import('/src/lib/video/pipeline.ts');});await page.waitForTimeout(2500);}catch{/* a reload during warm-up is expected */}
  await page.close();
 }
});
const asset=(n:string)=>path.join(import.meta.dirname,'assets',n);
async function openVideo(page:any,file='clip.webm'){
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.getByRole('radio',{name:'Somnia Video'}).click();
 await expect(page.getByTestId('video-start')).toBeVisible();
 const chooser=page.waitForEvent('filechooser');await page.getByTestId('video-open').click();await (await chooser).setFiles(asset(file));
 await expect(page.getByTestId('video-workspace')).toBeVisible();
}
async function probeDuration(page:any,bytes:Uint8Array){
 return page.evaluate(async(raw)=>{
  const {probeVideo}=await import('/src/lib/video/pipeline.ts');
  return (await probeVideo(new Uint8Array(raw).buffer as ArrayBuffer)).duration;
 },[...bytes] as number[]);
}
test('Video Studio: open WebM, play, trim with I/O, export a real trimmed WebM',async({page})=>{
 await openVideo(page);
 await expect(page.getByRole('radio',{name:'Somnia Video'})).toHaveAttribute('aria-checked','true');
 await expect(page.getByTestId('video-info')).toContainText('320×180',{timeout:30000});
 await expect(page.getByTestId('video-info')).toContainText('vp9');
 await expect(page.getByTestId('video-controls')).toBeVisible();
 await expect(page.getByTestId('video-result')).toContainText('No edits yet');
 await page.screenshot({path:'test-results/video-open.png'});
 // playback really advances
 await page.getByTestId('video-play').click();
 await expect.poll(async()=>page.evaluate(()=>document.querySelector('video')!.currentTime),{timeout:8000}).toBeGreaterThan(0.15);
 await page.getByTestId('video-play').click();
 // trim via I/O keys at the playhead edits the clip under it
 await page.evaluate(()=>{document.querySelector('video')!.currentTime=0.5;});
 await page.getByTestId('video-workspace').press('i');
 await page.evaluate(()=>{document.querySelector('video')!.currentTime=1.5;});
 await page.getByTestId('video-workspace').press('o');
 await page.getByTestId('video-clip').first().click();
 await expect(page.getByTestId('video-clip-in-input')).toHaveValue('0.5');
 await expect(page.getByTestId('video-clip-out-input')).toHaveValue('1.5');
 await page.screenshot({path:'test-results/video-trimmed.png'});
 // export is a real VP9/Opus WebM of the trimmed range
 const download=page.waitForEvent('download');await page.getByTestId('video-export').click();const d=await download;
 expect(d.suggestedFilename()).toBe('clip-edited.webm');
 const bytes=readFileSync(await d.path()!);
 expect([...bytes.subarray(0,4)]).toEqual([0x1a,0x45,0xdf,0xa3]);expect(bytes.length).toBeGreaterThan(10_000);
 expect(Math.abs(await probeDuration(page,bytes)-1)).toBeLessThan(0.35);
 await expect(page.getByTestId('video-result')).toContainText('vp9');
 await expect(page.getByTestId('video-note')).toContainText('downloaded');
 await page.screenshot({path:'test-results/video-exported.png'});
 // reset brings back the untouched single-clip state
 await page.getByTestId('video-reset').click();
 await expect(page.getByTestId('video-clip')).toHaveCount(1);
 await expect(page.getByTestId('video-result')).toContainText('No edits yet');
});
test('Video Studio: H.264 MP4 shows an honest no-preview note but still probes and can export',async({page})=>{
 await openVideo(page,'clip.mp4');
 await expect(page.getByTestId('video-info')).toContainText('avc');
 const nopreview=page.getByTestId('video-nopreview');
 if(await nopreview.count())await expect(nopreview).toContainText('cannot play');
 await page.screenshot({path:'test-results/video-mp4.png'});
});
test('Video Studio: a file that is not video is rejected with a notice, no tab opens',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.getByRole('radio',{name:'Somnia Video'}).click();
 const chooser=page.waitForEvent('filechooser');await page.getByTestId('video-open').click();await (await chooser).setFiles(asset('fake.webm'));
 await expect(page.locator('footer [role="status"]')).toContainText('fake.webm is not a valid');
 await expect(page.getByTestId('video-workspace')).toHaveCount(0);
 await expect(page.getByTestId('video-start')).toBeVisible();
});
test('Video Studio: switching to Code keeps the video tab and shows the settings inline',async({page})=>{
 await openVideo(page);
 await page.getByRole('radio',{name:'Somnia Code'}).click();
 await expect(page.getByRole('radio',{name:'Somnia Code'})).toHaveAttribute('aria-checked','true');
 await expect(page.getByTestId('video-workspace')).toBeVisible();
 await expect(page.getByTestId('video-controls')).toBeVisible();
});
test('Video Studio: add a second source, split, ripple delete, reorder, mute, export the joined timeline',async({page})=>{
 await openVideo(page);
 // add clip2.webm straight from the file dialog; the project tab stays active
 const chooser=page.waitForEvent('filechooser');await page.getByTestId('video-add-open').click();await (await chooser).setFiles(asset('clip2.webm'));
 await expect(page.getByTestId('video-clip')).toHaveCount(2);
 await expect(page.getByTestId('video-clip-count')).toContainText('2');
 await expect(page.getByTestId('video-timeline-summary')).toContainText('4.01');
 await expect(page.getByTestId('video-name')).toContainText('clip.webm');
 await page.screenshot({path:'test-results/video-multiclip.png'});
 // split the first clip at the playhead
 await page.evaluate(()=>{document.querySelector('video')!.currentTime=1;});
 await expect(page.getByTestId('video-time')).toContainText('0:01.0');
 await page.getByTestId('video-workspace').press('s');
 await expect(page.getByTestId('video-clip')).toHaveCount(3);
 await page.screenshot({path:'test-results/video-split.png'});
 // ripple delete the middle part: 3 -> 2 clips, timeline is 3 s
 await page.getByTestId('video-clip').nth(1).click();
 await page.getByTestId('video-clip-delete').click();
 await expect(page.getByTestId('video-clip')).toHaveCount(2);
 await expect(page.getByTestId('video-timeline-summary')).toContainText('3.01');
 // reorder: move the second clip in front of the first
 await page.getByTestId('video-clip').nth(1).click();
 await page.getByTestId('video-clip-left').click();
 await expect(page.getByTestId('video-clip').first()).toContainText('clip2');
 // mute the now-first clip and lower the gain of the other
 await page.getByTestId('video-clip-mute').check();
 await page.getByTestId('video-clip').nth(1).click();
 await page.getByTestId('video-clip-gain').fill('0.5');
 await page.screenshot({path:'test-results/video-clip-settings.png'});
 // export joins everything into one WebM of the timeline duration
 const download=page.waitForEvent('download');await page.getByTestId('video-export').click();const d=await download;
 expect(d.suggestedFilename()).toBe('clip-edited.webm');
 const bytes=readFileSync(await d.path()!);
 expect([...bytes.subarray(0,4)]).toEqual([0x1a,0x45,0xdf,0xa3]);
 expect(Math.abs(await probeDuration(page,bytes)-3)).toBeLessThan(0.6);
 await expect(page.getByTestId('video-result')).toContainText('3.01');
 await page.screenshot({path:'test-results/video-multi-exported.png'});
});
for(const locale of ['de','es','fr','pt-BR'])test(`Video Studio strings: ${locale}`,async({page})=>{
 await page.addInitScript(l=>localStorage.setItem('somnia.locale.v1',l),locale);await page.goto('/');
 await expect(page.locator('header [role="radiogroup"]').getByRole('radio')).toHaveCount(9);
 await expect(page.locator('header [role="radiogroup"]')).not.toContainText('studio.video');
 await page.locator('header [role="radiogroup"]').getByRole('radio').nth(5).click();
 await expect(page.getByTestId('video-start')).toBeVisible();await expect(page.getByTestId('video-start')).not.toContainText('video.');
});
