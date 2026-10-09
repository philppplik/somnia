import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import path from 'node:path';

/** P3 contract tests. Unconfirmed UI contracts are called out as ASSUMPTION below.
 * Nothing is skipped on absent P3 hooks: a missing feature should fail, not look green.
 * Run on the lead's built WASM tree: npx playwright test tests/video-studio-p3.spec.ts --workers=1
 */
test.setTimeout(120_000);
const asset=(name:string)=>path.join(import.meta.dirname,'assets',name);
async function openStudio(page:Page){
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.getByRole('radio',{name:'Somnia Video'}).click();
 await expect(page.getByTestId('video-start')).toBeVisible();
}
async function upload(page:Page,hook:string,file:string|{name:string;mimeType:string;buffer:Buffer}){
 const chooser=page.waitForEvent('filechooser');await page.getByTestId(hook).click();
 await (await chooser).setFiles(file);await expect(page.getByTestId('video-workspace')).toBeVisible();
 await expect(page.getByTestId('video-export')).toBeEnabled();
}
async function downloadExport(page:Page){
 const download=page.waitForEvent('download',{timeout:90_000});
 await page.getByTestId('video-export').click();const result=await download;
 expect(result.suggestedFilename()).toMatch(/-edited\.webm$/);
 const file=await result.path();expect(file).not.toBeNull();
 const bytes=readFileSync(file!);
 expect([...bytes.subarray(0,4)]).toEqual([0x1a,0x45,0xdf,0xa3]);
 await expect(page.getByTestId('video-note')).toContainText('downloaded');
 return bytes;
}
async function reprobe(page:Page,bytes:Uint8Array){
 return page.evaluate(async(raw)=>{
  // The same public probe used by the worker, run on the actual download, not its report.
  // @ts-expect-error Vite serves this browser-only absolute path.
  const {probeVideo}=await import('/src/lib/video/pipeline.ts');
  return probeVideo(new Uint8Array(raw).buffer);
 },[...bytes]);
}
/** Deterministic WebCodecs fixtures: exact 2 s, 25 fps, 320x180, stereo 48 kHz.
 * Solid colors and distinct pure tones make a sequential cut or silent overlap detectable.
 * This is test tooling only; it never replaces the app's real export path.
 */
async function syntheticClip(page:Page,color:string,hz:number){
 const bytes=await page.evaluate(async({color,hz})=>{
  // @ts-expect-error Direct dependency module is served by Vite; not a Node import.
  const m=await import('/node_modules/mediabunny/dist/modules/src/index.js');
  const canvas=new OffscreenCanvas(320,180),ctx=canvas.getContext('2d')!;
  ctx.fillStyle=color;ctx.fillRect(0,0,320,180);
  const target=new m.BufferTarget();
  const output=new m.Output({target,format:new m.WebMOutputFormat()});
  const video=new m.CanvasSource(canvas,{codec:'vp9',bitrate:500_000});
  const audio=new m.AudioSampleSource({codec:'opus',bitrate:256_000});
  output.addVideoTrack(video);output.addAudioTrack(audio);await output.start();
  for(let frame=0;frame<50;frame++){
   await video.add(frame/25,1/25);
   for(let block=0;block<2;block++){
    const base=frame*1920+block*960,data=new Float32Array(960*2);
    for(let i=0;i<960;i++)data[i*2]=data[i*2+1]=0.2*Math.sin(2*Math.PI*hz*(base+i)/48_000);
    const sample=new m.AudioSample({data,format:'f32',numberOfChannels:2,sampleRate:48_000,timestamp:base/48_000});
    try{await audio.add(sample);}finally{sample.close();}
   }
  }
  await output.finalize();return [...new Uint8Array(target.buffer!)];
 },{color,hz});
 return Buffer.from(bytes);
}
async function frameFacts(page:Page,bytes:Uint8Array,time:number,background?:number[]){
 return page.evaluate(async({raw,time,background})=>{
  // @ts-expect-error Browser-only Vite dependency path.
  const m=await import('/node_modules/mediabunny/dist/modules/src/index.js');
  const input=new m.Input({source:new m.BufferSource(new Uint8Array(raw).buffer),formats:m.ALL_FORMATS});
  try{
   const track=await input.getPrimaryVideoTrack();if(!track)throw new Error('No exported video track');
   const wrapped=await new m.CanvasSink(track,{width:320,height:180,fit:'contain'}).getCanvas(time);
   if(!wrapped)throw new Error(`No exported frame at ${time}`);
   const canvas=new OffscreenCanvas(320,180),ctx=canvas.getContext('2d')!;
   ctx.drawImage(wrapped.canvas,0,0);const data=ctx.getImageData(0,0,320,180).data;
   const p=(90*320+160)*4;let changed=0;
   if(background)for(let i=0;i<data.length;i+=4){
    if(Math.max(...background.map((v,c)=>Math.abs(v-data[i+c])))>45)changed++;
   }
   return{center:[data[p],data[p+1],data[p+2]],changed};
  }finally{input.dispose();}
 },{raw:[...bytes],time,background});
}
/** Decode real exported audio, measure amplitudes independently of the app's mixing math.
 * Quadrature projection is phase-independent and distinguishes linear from equal-power fades.
 */
async function audioFacts(page:Page,bytes:Uint8Array,start:number,end:number){
 return page.evaluate(async({raw,start,end})=>{
  // @ts-expect-error Browser-only Vite dependency path.
  const m=await import('/node_modules/mediabunny/dist/modules/src/index.js');
  const input=new m.Input({source:new m.BufferSource(new Uint8Array(raw).buffer),formats:m.ALL_FORMATS});
  try{
   const track=await input.getPrimaryAudioTrack();if(!track)throw new Error('No exported audio track');
   const sums=[440,880].map(hz=>({hz,sin:0,cos:0}));let count=0,squares=0,first=Infinity,last=-Infinity;
   for await(const sample of new m.AudioSampleSink(track).samples(start,end)){
    try{
     const data=new Float32Array(sample.allocationSize({planeIndex:0,format:'f32-planar'})/4);
     sample.copyTo(data,{planeIndex:0,format:'f32-planar'});
     for(let i=0;i<sample.numberOfFrames;i++){
      const t=sample.timestamp+i/sample.sampleRate;if(t<start||t>=end)continue;
      const v=data[i];count++;squares+=v*v;first=Math.min(first,t);last=Math.max(last,t);
      for(const s of sums){s.sin+=v*Math.sin(2*Math.PI*s.hz*t);s.cos+=v*Math.cos(2*Math.PI*s.hz*t);}
     }
    }finally{sample.close();}
   }
   return{count,first,last,rms:Math.sqrt(squares/Math.max(1,count)),amplitudes:sums.map(s=>2*Math.hypot(s.sin,s.cos)/Math.max(1,count))};
  }finally{input.dispose();}
 },{raw:[...bytes],start,end});
}
async function timelineDuration(page:Page,root:string){
 return page.evaluate(async(root)=>{
  // @ts-expect-error Browser-only Vite source path.
  const {getVideoSession}=await import('/src/lib/video/session.ts');
  // @ts-expect-error Browser-only Vite source path.
  const {timelineDuration}=await import('/src/lib/video/timeline.ts');
  const session=getVideoSession(root);if(!session)throw new Error(`Missing session ${root}`);
  return timelineDuration(session.clips);
 },root);
}

test('P3 filmstrip: decoded thumbnails render, then remain visible after trim and move',async({page})=>{
 await openStudio(page);await upload(page,'video-open',asset('clip.webm'));
 // Confirmed hook: one video-filmstrip per media clip. ASSUMPTION: img/canvas samples.
 const strip=page.getByTestId('video-filmstrip').first();await expect(strip).toBeVisible();
 const decoded=async()=>strip.locator('img,canvas').evaluateAll(nodes=>nodes.some(node=>{
  let canvas:HTMLCanvasElement;
  if(node instanceof HTMLImageElement){
   if(!node.complete||!node.naturalWidth||!node.naturalHeight)return false;
   canvas=document.createElement('canvas');canvas.width=node.naturalWidth;canvas.height=node.naturalHeight;
   const ctx=canvas.getContext('2d');if(!ctx)return false;ctx.drawImage(node,0,0);
  }else if(node instanceof HTMLCanvasElement)canvas=node;else return false;
  if(!canvas.width||!canvas.height)return false;const ctx=canvas.getContext('2d');if(!ctx)return false;
  const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  return data.some((v,i)=>i%4!==3&&v>20);
 }));
 await expect.poll(decoded).toBe(true);
 await page.getByTestId('video-clip').first().click();
 await page.getByTestId('video-clip-in-input').fill('0.5');
 await expect.poll(decoded).toBe(true);
 await upload(page,'video-add-open',asset('clip2.webm'));
 await expect(page.getByTestId('video-filmstrip')).toHaveCount(2);
 await page.getByTestId('video-clip').nth(1).click();await page.getByTestId('video-clip-left').click();
 await expect(page.getByTestId('video-clip').first()).toContainText('clip2');
 await expect.poll(decoded).toBe(true);
 await page.screenshot({path:'test-results/video-p3-filmstrip.png'});
});

test('P3 titles: add, edit, export visible text and preserve a silent title span',async({page})=>{
 await openStudio(page);await upload(page,'video-open',asset('clip.webm'));
 const mediaDuration=await timelineDuration(page,'clip.webm');
 // Confirmed title field hooks. ASSUMPTION: add appends and selects the new card.
 await page.getByTestId('video-add-title').click();await expect(page.getByTestId('video-clip')).toHaveCount(2);
 await page.getByTestId('video-title-text').fill('P3 ROUND TRIP');
 await page.getByTestId('video-title-duration').fill('1');
 await page.getByTestId('video-title-background').fill('#102030');
 await page.getByTestId('video-title-font-size').fill('32');
 await expect(page.getByTestId('video-title-text')).toHaveValue('P3 ROUND TRIP');
 await expect.poll(()=>timelineDuration(page,'clip.webm')).toBeCloseTo(mediaDuration+1,3);
 await expect(page.getByTestId('video-export')).toBeEnabled();
 await page.screenshot({path:'test-results/video-p3-title-edit.png'});
 const bytes=await downloadExport(page),probe=await reprobe(page,bytes);
 expect(Math.abs(probe.duration-(mediaDuration+1))).toBeLessThanOrEqual(0.35);
 expect(probe.video?.codec).toMatch(/^vp[89]$/);expect(probe.audio?.codec).toBe('opus');
 // Background alone is insufficient: a sizeable non-background glyph region must be encoded.
 const titleFrame=await frameFacts(page,bytes,mediaDuration+0.5,[16,32,48]);
 expect(titleFrame.changed).toBeGreaterThan(100);
 const silence=await audioFacts(page,bytes,mediaDuration+0.2,mediaDuration+0.8);
 expect(silence.count).toBeGreaterThan(20_000);expect(silence.rms).toBeLessThan(0.005);
 // Move the card to the beginning, proving silence doesn't collapse the subsequent audio clock.
 await page.getByTestId('video-clip-left').click();
 const moved=await downloadExport(page);
 expect(Math.abs((await reprobe(page,moved)).duration-(mediaDuration+1))).toBeLessThanOrEqual(0.35);
 expect((await frameFacts(page,moved,0.5,[16,32,48])).changed).toBeGreaterThan(100);
 expect((await audioFacts(page,moved,0.2,0.8)).rms).toBeLessThan(0.005);
 expect((await audioFacts(page,moved,1.2,1.8)).rms).toBeGreaterThan(0.01);
 await page.screenshot({path:'test-results/video-p3-title-export.png'});
});

test('P3 crossfade: two sources overlap, blend pixels and mix equal-power audio in exported WebM',async({page})=>{
 await openStudio(page);
 const red=await syntheticClip(page,'#ff0000',440),blue=await syntheticClip(page,'#0000ff',880);
 await upload(page,'video-open',{name:'p3-red.webm',mimeType:'video/webm',buffer:red});
 await upload(page,'video-add-open',{name:'p3-blue.webm',mimeType:'video/webm',buffer:blue});
 await expect(page.getByTestId('video-clip')).toHaveCount(2);
 const before=await timelineDuration(page,'p3-red.webm');expect(before).toBeCloseTo(4,1);
 // Encode the hard-cut edit through the same app path as a codec-matched audio reference.
 const hardCut=await downloadExport(page);
 const a=await audioFacts(page,hardCut,1.725,1.775),b=await audioFacts(page,hardCut,2.225,2.275);
 await page.getByTestId('video-clip').first().click();
 // Confirmed: selected clip owns its outgoing fade; 0 removes it.
 await page.getByTestId('video-clip-transition-duration').fill('0.5');
 await expect.poll(()=>timelineDuration(page,'p3-red.webm')).toBeCloseTo(before-0.5,3);
 // Home then frame-forward: probed ~25 fps puts the preview near 1.76 s, inside the overlap.
 await page.getByTestId('video-workspace').press('Home');
 for(let i=0;i<45;i++)await page.getByTestId('video-frame-fwd').click();
 const incoming=page.getByTestId('video-player-b');await expect(incoming).toBeVisible();
 await expect.poll(()=>incoming.evaluate(el=>Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.45);
 await expect.poll(()=>incoming.evaluate(el=>Number(getComputedStyle(el).opacity))).toBeLessThan(0.60);
 const outgoing=page.getByTestId('video-player');
 await expect(outgoing).toHaveAttribute('data-clip-id',/./);await expect(incoming).toHaveAttribute('data-clip-id',/./);
 expect(await outgoing.getAttribute('data-clip-id')).not.toBe(await incoming.getAttribute('data-clip-id'));
 await expect.poll(()=>outgoing.evaluate(el=>(el as HTMLVideoElement).currentTime)).toBeCloseTo(1.76,1);
 await expect.poll(()=>incoming.evaluate(el=>(el as HTMLVideoElement).currentTime)).toBeCloseTo(0.26,1);
 await page.screenshot({path:'test-results/video-p3-crossfade.png'});
 const bytes=await downloadExport(page),probe=await reprobe(page,bytes);
 expect(Math.abs(probe.duration-(before-0.5))).toBeLessThanOrEqual(0.35);
 expect(probe.video).toMatchObject({width:320,height:180});expect(probe.video?.codec).toMatch(/^vp[89]$/);
 expect(probe.audio).toMatchObject({codec:'opus',channels:2,rate:48_000});
 const pre=(await frameFacts(page,bytes,0.75)).center;
 const mid=(await frameFacts(page,bytes,1.75)).center;
 const post=(await frameFacts(page,bytes,2.75)).center;
 expect(pre[0]).toBeGreaterThan(230);expect(pre[2]).toBeLessThan(20);
 expect(post[2]).toBeGreaterThan(230);expect(post[0]).toBeLessThan(20);
 expect(mid[0]).toBeGreaterThan(100);expect(mid[0]).toBeLessThan(155);
 expect(mid[2]).toBeGreaterThan(100);expect(mid[2]).toBeLessThan(155);expect(mid[1]).toBeLessThan(25);
 const mix=await audioFacts(page,bytes,1.725,1.775);
 expect(a.amplitudes[0]).toBeGreaterThan(0.10);expect(b.amplitudes[1]).toBeGreaterThan(0.10);
 expect(mix.count).toBeGreaterThan(2_000);
 // Confirmed equal-power curve: midpoint ~= sqrt(1/2), not linear 0.5.
 for(const ratio of [mix.amplitudes[0]/a.amplitudes[0],mix.amplitudes[1]/b.amplitudes[1]]){
  expect(ratio).toBeGreaterThan(0.60);expect(ratio).toBeLessThan(0.82);
 }
 const expectedRms=Math.sqrt((a.rms*a.rms+b.rms*b.rms)/2);
 expect(mix.rms/expectedRms).toBeGreaterThan(0.85);expect(mix.rms/expectedRms).toBeLessThan(1.15);
 await expect(page.getByTestId('video-transition')).toBeVisible();
 const report=await page.evaluate(async()=>{
  // @ts-expect-error Browser-only Vite source path.
  const {getVideoSession}=await import('/src/lib/video/session.ts');
  return getVideoSession('p3-red.webm')?.result?.report.steps;
 });
 expect(report).toContain('Crossfades applied.');
 await page.getByTestId('video-clip-transition-duration').fill('0');
 await expect.poll(()=>timelineDuration(page,'p3-red.webm')).toBeCloseTo(before,3);
});
