import {test,expect} from './fixtures';
import {writeFileSync,mkdirSync} from 'node:fs';

// Stage C1 (take recording): the Record button captures the microphone through the REAL
// getUserMedia/MediaRecorder path (mic stubbed at the browser boundary by an oscillator stream),
// the take is decoded + resampled to the 48 kHz session WAV with WebAudio, lands as a new track
// in the arrangement, and the microphone is released on stop. The WASM analysis engine is
// substituted by the supported setSoundEngineFactory hook, as in the Stage A/C2 tests.
// NOTE: run against a FRESH vite dev server. After HMR edits vite serves store modules with
// ?t= URLs, so the page and the in-test dynamic imports would get separate singletons.

const SR=48000,FRAMES=Math.floor(0.5*SR);
function toneWav(path:string){
 mkdirSync('test-results',{recursive:true});
 const out=Buffer.alloc(44+FRAMES*2*4);
 out.write('RIFF',0);out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);
 out.writeUInt32LE(16,16);out.writeUInt16LE(3,20);out.writeUInt16LE(2,22);
 out.writeUInt32LE(SR,24);out.writeUInt32LE(SR*8,28);out.writeUInt16LE(8,32);out.writeUInt16LE(32,34);
 out.write('data',36);out.writeUInt32LE(FRAMES*8,40);
 for(let i=0;i<FRAMES;i++){const v=0.4*Math.sin(2*Math.PI*220*i/SR);out.writeFloatLE(v,44+i*8);out.writeFloatLE(v,44+i*8+4);}
 writeFileSync(path,out);
}

test('Sound Stage C1: explicit record captures a take onto a new track and releases the mic',async({page})=>{
 const wavPath='test-results/stage-c1-source.wav';toneWav(wavPath);
 const consoleErrors:string[]=[];page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
 await page.addInitScript(()=>{
  // Browser-boundary stub: a 440 Hz oscillator stands in for the microphone. Counts calls so the
  // test can prove the mic is only opened by the explicit Record button, released on stop.
  const w=window as unknown as {__micCalls?:number;__micLive?:number};
  w.__micCalls=0;w.__micLive=0;
  navigator.mediaDevices.getUserMedia=async()=>{
   w.__micCalls=(w.__micCalls??0)+1;
   const ctx=new AudioContext();
   const osc=ctx.createOscillator();osc.frequency.value=440;
   const dest=ctx.createMediaStreamDestination();osc.connect(dest);osc.start();
   const track=dest.stream.getAudioTracks()[0];
   w.__micLive=(w.__micLive??0)+1;
   const origStop=track.stop.bind(track);
   track.stop=()=>{origStop();w.__micLive=Math.max(0,(w.__micLive??1)-1);};
   return dest.stream;
  };
 });
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
 // No microphone access before the explicit button.
 expect(await page.evaluate(()=>(window as unknown as {__micCalls:number}).__micCalls)).toBe(0);
 const chooser=page.waitForEvent('filechooser');
 await page.getByTestId('sound-open').click();
 (await chooser).setFiles(wavPath);
 await expect(page.getByTestId('sound-workspace')).toBeVisible();
 await page.getByRole('button',{name:/Arrange & Mix|Arrangement & Mix/}).click();
 await expect(page.getByTestId('sound-arrange')).toBeVisible();
 await page.getByTestId('sound-arrange-add-source').click();
 await expect(page.locator('[data-testid=arrange-clip]')).toHaveCount(1);
 expect(await page.evaluate(()=>(window as unknown as {__micCalls:number}).__micCalls)).toBe(0);

 // Record ~2 s, then stop with the same button.
 await page.getByTestId('sound-arrange-record').click();
 await expect(page.getByTestId('sound-arrange-record')).toHaveAttribute('aria-pressed','true');
 await expect(page.getByTestId('sound-arrange-record')).toContainText(/0:0/);
 await page.waitForTimeout(2000);
 await page.getByTestId('sound-arrange-record').click();
 await expect(page.getByTestId('sound-arrange-record')).toHaveAttribute('aria-pressed','false');

 // The take lands as a second clip on its own track, named take.wav.
 await expect(page.locator('[data-testid=arrange-clip]')).toHaveCount(2,{timeout:15000});
 await expect(page.locator('[data-testid=arrange-mixer-track]')).toHaveCount(2);
 await expect(page.locator('[data-testid=arrange-mixer-track]').nth(1).locator('input').first()).toHaveValue('take.wav');
 // Microphone released after stop.
 expect(await page.evaluate(()=>(window as unknown as {__micLive:number}).__micLive)).toBe(0);
 expect(await page.evaluate(()=>(window as unknown as {__micCalls:number}).__micCalls)).toBe(1);
 expect(consoleErrors.filter(e=>!/favicon|DevTools/.test(e))).toEqual([]);
});
