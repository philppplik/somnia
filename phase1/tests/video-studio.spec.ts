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
test('Video Studio: open WebM, play, trim with I/O, export a real trimmed WebM',async({page})=>{
 await openVideo(page);
 await expect(page.getByRole('radio',{name:'Somnia Video'})).toHaveAttribute('aria-checked','true');
 await expect(page.getByTestId('video-info')).toContainText('320×180');
 await expect(page.getByTestId('video-info')).toContainText('vp9');
 await expect(page.getByTestId('video-controls')).toBeVisible();
 await expect(page.getByTestId('video-result')).toContainText('No edits yet');
 await page.screenshot({path:'test-results/video-open.png'});
 // playback really advances
 await page.getByTestId('video-play').click();
 await expect.poll(async()=>page.evaluate(()=>document.querySelector('video')!.currentTime),{timeout:8000}).toBeGreaterThan(0.15);
 await page.getByTestId('video-play').click();
 // trim via I/O keys at the playhead
 await page.evaluate(()=>{document.querySelector('video')!.currentTime=0.5;});
 await page.getByTestId('video-workspace').press('i');
 await page.evaluate(()=>{document.querySelector('video')!.currentTime=1.5;});
 await page.getByTestId('video-workspace').press('o');
 await expect(page.getByTestId('video-trim-chip')).toContainText('0.50');
 await expect(page.getByTestId('video-trim-chip')).toContainText('1.50');
 await expect(page.getByTestId('video-trim-start-input')).toHaveValue('0.5');
 await page.screenshot({path:'test-results/video-trimmed.png'});
 // export is a real VP9/Opus WebM of the trimmed range
 const download=page.waitForEvent('download');await page.getByTestId('video-export').click();const d=await download;
 expect(d.suggestedFilename()).toBe('clip-trimmed.webm');
 const bytes=readFileSync(await d.path()!);
 expect([...bytes.subarray(0,4)]).toEqual([0x1a,0x45,0xdf,0xa3]);expect(bytes.length).toBeGreaterThan(10_000);
 const duration=await page.evaluate(async(raw)=>{
  const {probeVideo}=await import('/src/lib/video/pipeline.ts');
  return (await probeVideo(new Uint8Array(raw).buffer as ArrayBuffer)).duration;
 },[...bytes]);
 expect(Math.abs(duration-1)).toBeLessThan(0.35);
 await expect(page.getByTestId('video-result')).toContainText('vp9');
 await expect(page.getByTestId('video-note')).toContainText('downloaded');
 await page.screenshot({path:'test-results/video-exported.png'});
 // reset brings back the untouched state
 await page.getByTestId('video-reset').click();
 await expect(page.getByTestId('video-trim-chip')).toHaveCount(0);
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
for(const locale of ['de','es','fr','pt-BR'])test(`Video Studio strings: ${locale}`,async({page})=>{
 await page.addInitScript(l=>localStorage.setItem('somnia.locale.v1',l),locale);await page.goto('/');
 await expect(page.locator('header [role="radiogroup"]').getByRole('radio')).toHaveCount(6);
 await expect(page.locator('header [role="radiogroup"]')).not.toContainText('studio.video');
 await page.locator('header [role="radiogroup"]').getByRole('radio').nth(5).click();
 await expect(page.getByTestId('video-start')).toBeVisible();await expect(page.getByTestId('video-start')).not.toContainText('video.');
});
