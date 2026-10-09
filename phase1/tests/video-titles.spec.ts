import {test,expect} from './fixtures';
import path from 'node:path';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const asset=(n:string)=>path.join(import.meta.dirname,'assets',n);
const shots='test-results/video-titles';
async function openVideo(page:any,file='clip.webm'){
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.getByRole('radio',{name:'Somnia Video'}).click();
 const chooser=page.waitForEvent('filechooser');await page.getByTestId('video-open').click();await (await chooser).setFiles(asset(file));
 await expect(page.getByTestId('video-workspace')).toBeVisible();await expect(page.getByTestId('video-clip')).toHaveCount(1);
}
const inspect=(page:any,bytes:Uint8Array,at:number[])=>page.evaluate(async([raw,times]:[number[],number[]])=>(await import('/tests/helpers/inspectVideo.ts')).inspect(raw,times),[[...bytes],at] as [number[],number[]]);
test('title card: add, edit, preview, play through, export with frames and silence in sync',async({page})=>{
 mkdirSync(shots,{recursive:true});
 await openVideo(page);
 // add a title after the clip, edit it through the inspector
 await page.getByTestId('video-add-title').click();
 await expect(page.getByTestId('video-clip')).toHaveCount(2);
 await expect(page.getByTestId('video-title-panel')).toBeVisible();
 await page.getByTestId('video-title-text').fill('Chapter One\nThe beginning');
 await page.getByTestId('video-title-duration').fill('2');
 await page.getByTestId('video-title-background').fill('#1e3a8a');
 await page.getByTestId('video-title-font-size').fill('96');
 await page.getByTestId('video-title-fadein').fill('0');await page.getByTestId('video-title-fadeout').fill('0');
 await expect(page.getByTestId('video-timeline-summary')).toContainText('2 clips');
 const total=await page.getByTestId('video-time').innerText();console.log('time label',total);
 // preview: seek into the title (timeline click near the end), the card replaces the video
  await page.screenshot({path:`${shots}/0-before-seek.png`});
 await page.getByTestId('video-workspace').press('End');await page.getByTestId('video-workspace').press('ArrowLeft');
 await expect(page.getByTestId('video-title-preview')).toBeVisible();
 await expect(page.getByTestId('video-player')).toHaveCount(0);
 const px=await page.getByTestId('video-title-preview').evaluate((c:HTMLCanvasElement)=>[...c.getContext('2d')!.getImageData(5,5,1,1).data]);
 expect(px.slice(0,3)).toEqual([0x1e,0x3a,0x8a]);
 await page.screenshot({path:`${shots}/1-preview-and-inspector.png`});
 // playing through the title runs the clock to the end
 await page.getByTestId('video-workspace').press('Home');
 await page.getByTestId('video-play').click();
 await expect(page.getByTestId('video-title-preview')).toBeVisible({timeout:15000});
 await expect.poll(async()=>(await page.getByTestId('video-time').innerText()).split(' / ')[0],{timeout:10000}).not.toBe('0:00.0');
 await page.getByTestId('video-play').click();
 // export
 const download=page.waitForEvent('download');await page.getByTestId('video-export').click();const d=await download;
 const bytes=readFileSync(await d.path()!);writeFileSync(`${shots}/export.webm`,bytes);
 expect(d.suggestedFilename()).toBe('clip-edited.webm');
 await expect(page.getByTestId('video-result')).toContainText('vp9');
 const clipLen=Number(/1\.\d+|2\.\d+|\d+\.\d+/.exec(await page.getByTestId('video-info').innerText())![0]);
 const info=await inspect(page,bytes,[0.3,clipLen+1]);
 console.log('export info',JSON.stringify(info),'clipLen',clipLen);
 expect(Math.abs(info.duration-(clipLen+2))).toBeLessThan(0.4);
 // title span: frame holds the card colour; clip span does not
 [0x1e,0x3a,0x8a].forEach((want,i)=>expect(Math.abs(info.pixels[1][i]-want)).toBeLessThanOrEqual(12));
 expect(info.pixels[0][0]).not.toBe(0x1e);
 expect(info.audioEnd).not.toBeNull();
 expect(Math.abs((info.audioEnd as number)-info.duration)).toBeLessThan(0.4);
 const png=await page.evaluate(async([raw,t]:[number[],number])=>(await import('/tests/helpers/inspectVideo.ts')).frameDataUrl(raw,t),[[...bytes],clipLen+1] as [number[],number]);
 writeFileSync(`${shots}/2-exported-title-frame.png`,Buffer.from(png.split(',')[1],'base64'));
 await page.screenshot({path:`${shots}/3-after-export.png`});
});
test('title card first on the timeline, no audio elsewhere: export still renders',async({page})=>{
 mkdirSync(shots,{recursive:true});
 await openVideo(page);
 await page.getByTestId('video-add-title').click();
 await page.getByTestId('video-title-text').fill('Opening');
 await page.getByTestId('video-clip-left').click();
 await expect(page.getByTestId('video-clip').first()).toContainText('Opening');
 await page.screenshot({path:`${shots}/4-title-first.png`});
await page.getByTestId('video-export').click();await page.waitForTimeout(6000);console.log('STATUS',await page.getByTestId('video-status').innerText(),await page.getByTestId('video-note').innerText(),await page.getByTestId('video-result').innerText());
 const download=page.waitForEvent('download',{timeout:20000});await page.getByTestId('video-export').click();const d=await download;
 const bytes=readFileSync(await d.path()!);
 const info=await inspect(page,bytes,[0.5,4]);console.log('first-title export',JSON.stringify(info));
 [0x11,0x18,0x27].forEach((want,i)=>expect(Math.abs(info.pixels[0][i]-want)).toBeLessThanOrEqual(12));
 expect(Math.abs(info.duration-5.01)).toBeLessThan(0.4);expect(Math.abs((info.audioEnd as number)-info.duration)).toBeLessThan(0.4);
 expect(info.size[0]).toBe(320);expect(info.audioStart).not.toBeNull();
});
test('title between two clips: audio of both clips survives, silence fills the card, A/V end together',async({page})=>{
 mkdirSync(shots,{recursive:true});
 await openVideo(page);
 await page.getByTestId('video-add-title').click();await page.getByTestId('video-title-text').fill('Meanwhile');
 await page.getByTestId('video-title-duration').fill('1.5');
 const chooser=page.waitForEvent('filechooser');await page.getByTestId('video-add-open').click();await (await chooser).setFiles(asset('clip2.webm'));
 await expect(page.getByTestId('video-clip')).toHaveCount(3);
 await page.screenshot({path:`${shots}/5-title-between-clips.png`});
 const download=page.waitForEvent('download');await page.getByTestId('video-export').click();const d=await download;
 const info=await inspect(page,readFileSync(await d.path()!),[1,2.5,3.9]);console.log('between export',JSON.stringify(info));
 expect(Math.abs(info.duration-(2.01*2+1.5))).toBeLessThan(0.4);
 expect(Math.abs((info.audioEnd as number)-info.duration)).toBeLessThan(0.4);
 [0x11,0x18,0x27].forEach((want,i)=>expect(Math.abs(info.pixels[1][i]-want)).toBeLessThanOrEqual(12));
});
