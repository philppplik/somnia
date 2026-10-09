import {test,expect} from './fixtures';
import path from 'node:path';
import {readFileSync} from 'node:fs';
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
test('Video Studio: a crossfade overlaps two clips, blends the preview and shortens the export',async({page})=>{
 await openVideo(page);
 const chooser=page.waitForEvent('filechooser');await page.getByTestId('video-add-open').click();await (await chooser).setFiles(asset('clip2.webm'));
 await expect(page.getByTestId('video-clip')).toHaveCount(2);
 await expect(page.getByTestId('video-timeline-summary')).toContainText('4.01');
 // select the first clip and give it a 0.5 s crossfade into the second
 await page.getByTestId('video-clip').first().click();
 await expect(page.getByTestId('video-clip-transition-duration')).toBeVisible();
 await page.getByTestId('video-clip-transition-duration').fill('0.5');
 await expect(page.getByTestId('video-timeline-summary')).toContainText('3.51');
 await expect(page.getByTestId('video-transition')).toHaveCount(1);
 await page.screenshot({path:'test-results/video-crossfade.png'});
 // scrub into the fade: both preview slots are live, the incoming one at partial opacity
 await page.evaluate(()=>{document.querySelector('video')!.currentTime=1.75;});
 await expect.poll(async()=>page.getByTestId('video-player-b').evaluate(el=>Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.05);
 const opacity=await page.getByTestId('video-player-b').evaluate(el=>Number(getComputedStyle(el).opacity));
 expect(opacity).toBeLessThan(0.95);
 await expect(page.getByTestId('video-player-b')).toHaveAttribute('data-clip-id',/.+/);
 await page.screenshot({path:'test-results/video-crossfade-preview.png'});
 // export is the joined length minus the overlap, still real VP9/Opus WebM
 const download=page.waitForEvent('download');await page.getByTestId('video-export').click();const d=await download;
 expect(d.suggestedFilename()).toBe('clip-edited.webm');
 const bytes=readFileSync(await d.path()!);
 expect([...bytes.subarray(0,4)]).toEqual([0x1a,0x45,0xdf,0xa3]);expect(bytes.length).toBeGreaterThan(10_000);
 expect(Math.abs(await probeDuration(page,bytes)-3.51)).toBeLessThan(0.6);
 await expect(page.getByTestId('video-result')).toContainText('3.51');
 await page.screenshot({path:'test-results/video-crossfade-exported.png'});
});
test('Video Studio: crossfade clamps and edits survive split, delete and reset',async({page})=>{
 await openVideo(page);
 const chooser=page.waitForEvent('filechooser');await page.getByTestId('video-add-open').click();await (await chooser).setFiles(asset('clip2.webm'));
 await expect(page.getByTestId('video-clip')).toHaveCount(2);
 // set a partial fade on the first clip
 await page.getByTestId('video-clip').first().click({position:{x:4,y:4}});
 await page.getByTestId('video-clip-transition-duration').fill('0.5');
 await expect(page.getByTestId('video-timeline-summary')).toContainText('3.51');
 // the last clip shows no transition input
 await page.getByTestId('video-clip').nth(1).click({position:{x:4,y:4}});
 await expect(page.getByTestId('video-clip-transition-duration')).toHaveCount(0);
 // split the first clip: the right part keeps the fade, the left cuts hard
 await page.getByTestId('video-clip').first().click({position:{x:4,y:4}});
 await page.evaluate(()=>{document.querySelector('video')!.currentTime=1;});
 await page.getByTestId('video-workspace').press('s');
 await expect(page.getByTestId('video-clip')).toHaveCount(3);
 await expect(page.getByTestId('video-transition')).toHaveCount(1);
 // deleting the faded part removes the fade with it
 await page.getByTestId('video-clip').nth(1).click({position:{x:4,y:4}});
 await expect(page.getByTestId('video-clip-transition-duration')).toHaveValue('0.5');
 await page.getByTestId('video-clip-delete').click();
 await expect(page.getByTestId('video-clip')).toHaveCount(2);
 await expect(page.getByTestId('video-transition')).toHaveCount(0);
 await expect(page.getByTestId('video-timeline-summary')).toContainText('3.01');
 // clamp: a fade longer than the shorter neighbour clamps to its length
 await page.getByTestId('video-clip').first().click({position:{x:4,y:4}});
 await page.getByTestId('video-clip-transition-duration').fill('99');
 await expect(page.getByTestId('video-clip-transition-duration')).toHaveValue('1');
 await expect(page.getByTestId('video-timeline-summary')).toContainText('2.01');
 // reset clears everything back to the untouched original
 await page.getByTestId('video-reset').click();
 await expect(page.getByTestId('video-clip')).toHaveCount(1);
 await expect(page.getByTestId('video-result')).toContainText('No edits yet');
});
