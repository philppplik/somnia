import {test,expect} from './fixtures';
import {writeFileSync,mkdirSync} from 'node:fs';

// Stage C3 (transcript-guided segment review): the panel segments the rendered track through the
// worker PCM path, lists the segments with the proven time marks, pre-checks filler-only segments
// as a SUGGESTION, and cuts the picked ones on segment boundaries as exactly one undoable edit.
// The native voice step is replaced at the injectable boundary (setSegmentTranscriber / setSegmentCapability,
// setSoundEngineFactory precedent) with a FORMAT fixture - this proves wiring, review UX and cut math,
// NOT transcription accuracy. Accuracy on real speech stays a device gate (pinned model on Philipp's Mac).
// NOTE: run against a FRESH vite dev server (same ?t= singleton reason as the C1 spec).

function floatWav(path:string,seconds:number,freq:number,sampleRate=8000){
 mkdirSync('test-results',{recursive:true});
 const frames=Math.floor(seconds*sampleRate);
 const out=Buffer.alloc(44+frames*4);
 out.write('RIFF',0);out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);
 out.writeUInt32LE(16,16);out.writeUInt16LE(3,20);out.writeUInt16LE(1,22);
 out.writeUInt32LE(sampleRate,24);out.writeUInt32LE(sampleRate*4,28);out.writeUInt16LE(4,32);out.writeUInt16LE(32,34);
 out.write('data',36);out.writeUInt32LE(frames*4,40);
 for(let i=0;i<frames;i++)out.writeFloatLE(0.4*Math.sin(2*Math.PI*freq*i/sampleRate),44+i*4);
 writeFileSync(path,out);
}

async function bootToSoundStart(page:import('@playwright/test').Page){
 await page.route('https://api.github.com/**',route=>route.fulfill({status:200,contentType:'application/json',body:'[]'}));
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.getByRole('radio',{name:'Somnia Sound'}).click();
 await expect(page.getByTestId('sound-start')).toBeVisible();
 await page.evaluate(async()=>{
  const session:any=await import('/src/lib/sound/session.ts');
  const sw:any=await import('/src/lib/sound/sessionWav.ts');
  session.setSoundEngineFactory(()=>({
   init:async()=>[],
   process:async(bytes:ArrayBuffer,ext:string)=>{
    const src=sw.decodeSessionWav('engine-input',bytes.slice(0));
    const frames=src.channels[0].length,peaks=new Float32Array(800);
    const stats={frames,sample_rate:src.sampleRate,channels:src.channels.length,duration_s:frames/src.sampleRate,peak_db:-3,rms_db:-18};
    return{wav:bytes,peaks,report:{format:ext,input:stats,output:stats,trimmed_range:null,steps:[],wav_bytes:bytes.byteLength},ms:1};
   },
   dispose(){},
  }));
 });
}

async function openIntoArrange(page:import('@playwright/test').Page,wavPath:string){
 const chooser=page.waitForEvent('filechooser');
 await page.getByTestId('sound-open').click();
 (await chooser).setFiles(wavPath);
 await expect(page.getByTestId('sound-workspace')).toBeVisible();
 await page.getByRole('button',{name:/Arrange & Mix|Arrangement & Mix/}).click();
 await expect(page.getByTestId('sound-arrange')).toBeVisible();
}

test('C3: the segment panel is hidden where the local voice model is unavailable (web build)',async({page})=>{
 const wavPath='test-results/stage-c3-hidden.wav';floatWav(wavPath,6,110);
 await bootToSoundStart(page);await openIntoArrange(page,wavPath);
 await expect(page.getByTestId('sound-arrange')).toBeVisible();
 await expect(page.getByTestId('sound-pauses')).toBeVisible();
 await expect(page.getByTestId('sound-segments')).toHaveCount(0);
});

test('C3: segment review lists proven time marks, pre-checks fillers, cuts as one undo',async({page})=>{
 const wavPath='test-results/stage-c3.wav';floatWav(wavPath,6,110);
 await bootToSoundStart(page);
 // Injectable boundary: capability ready + a format-fixture transcript. Captures the PCM it receives.
 await page.evaluate(async()=>{
  const mod:any=await import('/src/lib/sound/segmentTranscript.ts');
  const w=window as unknown as {__segPcm?:number};
  mod.setSegmentCapability(async()=>({ready:true,reason:'ready'}));
  mod.setSegmentTranscriber(async(pcm:Int16Array)=>{
   w.__segPcm=pcm.length;
   return mod.parseSegments([
    {from_ms:0,to_ms:1200,text:' ähm '},
    {from_ms:1200,to_ms:3400,text:'Hallo zusammen und willkommen zurück'},
    {from_ms:3400,to_ms:4000,text:'uh'},
   ],'de');
  });
 });
 await openIntoArrange(page,wavPath);
 await page.getByTestId('sound-arrange-add-source').click();
 await expect(page.locator('[data-testid=arrange-clip]')).toHaveCount(1,{timeout:30000});
 await expect(page.getByTestId('sound-segments')).toBeVisible();
 await page.getByTestId('sound-segments-detect').click();
 // Three segments with their emitted time marks; the two filler-only ones carry the suggestion badge.
 await expect(page.getByTestId('sound-segments-list').locator('li')).toHaveCount(3,{timeout:15000});
 await expect(page.getByTestId('sound-segments-list')).toContainText('0:00.00 - 0:01.20');
 await expect(page.getByTestId('sound-segments-list')).toContainText('Hallo zusammen und willkommen zurück');
 await expect(page.getByTestId('sound-segments-filler')).toHaveCount(2);
 // The real worker render fed the transcriber: ~6 s at 16 kHz mono.
 const pcmLen=await page.evaluate(()=>(window as unknown as {__segPcm?:number}).__segPcm??0);
 expect(pcmLen).toBeGreaterThan(90000);
 expect(pcmLen).toBeLessThan(110000);
 // Suggestion = exactly the two filler segments pre-checked.
 await expect(page.getByTestId('sound-segments-cut')).toHaveText('Cut selected (2)');
 // Unchecking everything disables the cut (no automatic cutting).
 await page.getByLabel('Segment 1').uncheck();
 await page.getByLabel('Segment 3').uncheck();
 await expect(page.getByTestId('sound-segments-cut')).toBeDisabled();
 await page.getByLabel('Segment 1').check();
 await page.getByLabel('Segment 3').check();
 // Cut the two suggested ranges (0-1.2 s and 3.4-4.0 s of the 6 s clip) as one undoable edit.
 await page.getByTestId('sound-segments-cut').click();
 await expect(page.locator('[data-testid=arrange-clip]')).toHaveCount(2);
 await expect(page.getByText(/4\.200 s \/ 4\.200 s|0\.000 s \/ 4\.200 s/)).toBeVisible();
 // Exactly one undo restores the original single 6 s clip.
 await page.getByTestId('sound-arrange').getByRole('button',{name:'Undo',exact:true}).click();
 await expect(page.locator('[data-testid=arrange-clip]')).toHaveCount(1);
 await expect(page.getByText(/0\.000 s \/ 6\.000 s/)).toBeVisible();
});
