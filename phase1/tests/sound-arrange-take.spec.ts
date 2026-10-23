import {test,expect,type Page} from './fixtures';
import {writeFileSync,mkdirSync} from 'node:fs';

// Stage C1 (take recording): the Record button captures the microphone through the REAL
// getUserMedia/MediaRecorder path, the take is decoded + resampled to the 48 kHz session WAV with
// WebAudio, lands as a new track in the arrangement, and the microphone is released on every exit.
// The WASM analysis engine is substituted by the supported setSoundEngineFactory hook (as in the
// Stage A/C2 tests) and the microphone is stubbed at the browser boundary by an oscillator stream.
// SCOPE OF PROOF: this exercises the app against a synthetic in-browser device. It is NOT a
// real-hardware/OS-permission-prompt test; the macOS mic flow on a device is verified separately.
// NOTE: run against a FRESH vite dev server. After HMR edits vite serves store modules with
// ?t= URLs, so the page and the in-test dynamic imports would get separate singletons.

const SR=48000;
function floatWav(path:string,seconds:number,channels:1|2,freq:number,sampleRate=SR){
 mkdirSync('test-results',{recursive:true});
 const frames=Math.floor(seconds*sampleRate);
 const out=Buffer.alloc(44+frames*channels*4);
 out.write('RIFF',0);out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);
 out.writeUInt32LE(16,16);out.writeUInt16LE(3,20);out.writeUInt16LE(channels,22);
 out.writeUInt32LE(sampleRate,24);out.writeUInt32LE(sampleRate*channels*4,28);out.writeUInt16LE(channels*4,32);out.writeUInt16LE(32,34);
 out.write('data',36);out.writeUInt32LE(frames*channels*4,40);
 for(let i=0;i<frames;i++){const v=0.4*Math.sin(2*Math.PI*freq*i/sampleRate);for(let c=0;c<channels;c++)out.writeFloatLE(v,44+(i*channels+c)*4);}
 writeFileSync(path,out);
}

async function stubMic(page:Page){
 await page.addInitScript(()=>{
  // Browser-boundary stub: a 440 Hz oscillator stands in for the microphone. __micCalls counts
  // opens, __micLive counts streams whose tracks were not stopped (leak detector).
  // Modes: 'allow' (default), 'reject' (permission denied), 'defer' (resolves only via __releaseMic).
  const w=window as unknown as {__micCalls?:number;__micLive?:number;__micMode?:string;__releaseMic?:()=>void};
  w.__micCalls=0;w.__micLive=0;
  const make=()=>{
   const ctx=new AudioContext();
   const osc=ctx.createOscillator();osc.frequency.value=440;
   const dest=ctx.createMediaStreamDestination();osc.connect(dest);osc.start();
   const track=dest.stream.getAudioTracks()[0];
   w.__micLive=(w.__micLive??0)+1;
   const origStop=track.stop.bind(track);
   track.stop=()=>{origStop();w.__micLive=Math.max(0,(w.__micLive??1)-1);};
   return dest.stream;
  };
  navigator.mediaDevices.getUserMedia=async()=>{
   w.__micCalls=(w.__micCalls??0)+1;
   if(w.__micMode==='reject')throw new DOMException('denied','NotAllowedError');
   if(w.__micMode==='defer')return new Promise<MediaStream>(res=>{w.__releaseMic=()=>res(make());});
   return make();
  };
 });
}

async function bootIntoArrange(page:Page,wavPath:string){
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
 const chooser=page.waitForEvent('filechooser');
 await page.getByTestId('sound-open').click();
 (await chooser).setFiles(wavPath);
 await expect(page.getByTestId('sound-workspace')).toBeVisible();
 await page.getByRole('button',{name:/Arrange & Mix|Arrangement & Mix/}).click();
 await expect(page.getByTestId('sound-arrange')).toBeVisible();
}

const mic=(page:Page,key:'__micCalls'|'__micLive')=>page.evaluate(k=>(window as unknown as Record<string,number>)[k],key);

test('C1: explicit record captures a take onto a new track, releases the mic, and is one undo',async({page})=>{
 const wavPath='test-results/stage-c1-source.wav';floatWav(wavPath,0.5,2,220);
 const consoleErrors:string[]=[];page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
 await stubMic(page);await bootIntoArrange(page,wavPath);
 await page.getByTestId('sound-arrange-add-source').click();
 await expect(page.locator('[data-testid=arrange-clip]')).toHaveCount(1);
 // No microphone access before the explicit button.
 expect(await mic(page,'__micCalls')).toBe(0);

 // Record ~2 s, then stop with the same button; the recording state names the stop action.
 await page.getByTestId('sound-arrange-record').click();
 await expect(page.getByTestId('sound-arrange-record')).toHaveAttribute('aria-pressed','true');
 await expect(page.getByTestId('sound-arrange-record')).toContainText('Stop take');
 await expect(page.getByTestId('sound-arrange-record')).toContainText(/0:0/);
 await page.waitForTimeout(2000);
 await page.getByTestId('sound-arrange-record').click();
 await expect(page.getByTestId('sound-arrange-record')).toHaveAttribute('aria-pressed','false');

 // The take lands as a second clip on its own track, named take.wav.
 await expect(page.locator('[data-testid=arrange-clip]')).toHaveCount(2,{timeout:15000});
 await expect(page.locator('[data-testid=arrange-mixer-track]')).toHaveCount(2);
 await expect(page.locator('[data-testid=arrange-mixer-track]').nth(1).locator('input').first()).toHaveValue('take.wav');
 // Microphone released after stop, opened exactly once.
 expect(await mic(page,'__micLive')).toBe(0);
 expect(await mic(page,'__micCalls')).toBe(1);

 // The whole take import is a single undoable edit.
 await page.getByTestId('sound-arrange').getByRole('button',{name:'Undo'}).click();
 await expect(page.locator('[data-testid=arrange-clip]')).toHaveCount(1);
 await expect(page.locator('[data-testid=arrange-mixer-track]')).toHaveCount(1);
 expect(consoleErrors.filter(e=>!/favicon|DevTools/.test(e))).toEqual([]);
});

test('C1: denied microphone permission shows the error and adds nothing',async({page})=>{
 const wavPath='test-results/stage-c1-denied.wav';floatWav(wavPath,0.5,2,220);
 await stubMic(page);await bootIntoArrange(page,wavPath);
 await page.evaluate(()=>{(window as unknown as {__micMode:string}).__micMode='reject';});
 await page.getByTestId('sound-arrange-record').click();
 await expect(page.getByTestId('sound-arrange-take-error')).toBeVisible();
 await expect(page.getByTestId('sound-arrange-record')).toHaveAttribute('aria-pressed','false');
 expect(await mic(page,'__micCalls')).toBe(1);
 expect(await mic(page,'__micLive')).toBe(0);
 await expect(page.locator('[data-testid=arrange-clip]')).toHaveCount(0);
});

test('C1: leaving the view while the permission prompt is open closes the late stream',async({page})=>{
 const wavPath='test-results/stage-c1-pending.wav';floatWav(wavPath,0.5,2,220);
 await stubMic(page);await bootIntoArrange(page,wavPath);
 await page.evaluate(()=>{(window as unknown as {__micMode:string}).__micMode='defer';});
 await page.getByTestId('sound-arrange-record').click();
 await page.waitForTimeout(300);
 expect(await mic(page,'__micCalls')).toBe(1);
 // Unmount the arrange view while getUserMedia is still pending.
 await page.getByRole('button',{name:'Clip editor'}).click();
 await expect(page.getByTestId('sound-arrange')).toHaveCount(0);
 // The stream arrives late: it must be stopped immediately, never recorded.
 await page.evaluate(()=>(window as unknown as {__releaseMic:()=>void}).__releaseMic());
 await page.waitForTimeout(500);
 expect(await mic(page,'__micLive')).toBe(0);
});

test('C1: the record button is disabled when the session already has 8 tracks',async({page})=>{
 const wavPath='test-results/stage-c1-full.wav';floatWav(wavPath,0.5,2,220);
 await stubMic(page);await bootIntoArrange(page,wavPath);
 await page.getByTestId('sound-arrange-add-source').click();
 await expect(page.locator('[data-testid=arrange-mixer-track]')).toHaveCount(1);
 for(let i=0;i<7;i++)await page.getByRole('button',{name:'Add track'}).click();
 await expect(page.locator('[data-testid=arrange-mixer-track]')).toHaveCount(8);
 await expect(page.getByTestId('sound-arrange-record')).toBeDisabled();
});

test('C1: a take that would cross the 120 s session limit fails cleanly and keeps the arrangement',async({page})=>{
 const wavPath='test-results/stage-c1-long.wav';floatWav(wavPath,119.3,1,110,8000);
 await stubMic(page);await bootIntoArrange(page,wavPath);
 await page.getByTestId('sound-arrange-add-source').click();
 await expect(page.locator('[data-testid=arrange-clip]')).toHaveCount(1,{timeout:30000});
 // Move the playhead to the session end via the ruler's End key (119.3 s).
 await page.getByRole('slider',{name:'Session playhead'}).focus();
 await page.keyboard.press('End');
 await expect(page.getByText(/119\.3\d{2} s \/ 119\.300 s/)).toBeVisible();
 await page.getByTestId('sound-arrange-record').click();
 await expect(page.getByTestId('sound-arrange-record')).toHaveAttribute('aria-pressed','true');
 await page.waitForTimeout(1200);
 await page.getByTestId('sound-arrange-record').click();
 // The take decodes but cannot be placed past the session end: error shown, arrangement untouched.
 await expect(page.getByTestId('sound-arrange-take-error')).toBeVisible({timeout:15000});
 await expect(page.locator('[data-testid=arrange-clip]')).toHaveCount(1);
 await expect(page.locator('[data-testid=arrange-mixer-track]')).toHaveCount(1);
 expect(await mic(page,'__micLive')).toBe(0);
});

test('C1: recording auto-stops at the 120 s session limit without a second click',async({page})=>{
 const wavPath='test-results/stage-c1-cap.wav';floatWav(wavPath,0.5,2,220);
 await stubMic(page);await bootIntoArrange(page,wavPath);
 await page.getByTestId('sound-arrange-add-source').click();
 await expect(page.locator('[data-testid=arrange-clip]')).toHaveCount(1);
 await page.getByTestId('sound-arrange-record').click();
 await expect(page.getByTestId('sound-arrange-record')).toHaveAttribute('aria-pressed','true');
 await page.waitForTimeout(1200);
 // Jump the clock past the cap: the recorder must stop itself.
 await page.evaluate(()=>{const real=Date.now.bind(Date);(window as unknown as {__realNow:()=>number}).__realNow=real;Date.now=()=>real()+121000;});
 await expect(page.getByTestId('sound-arrange-record')).toHaveAttribute('aria-pressed','false',{timeout:5000});
 await page.evaluate(()=>{Date.now=(window as unknown as {__realNow:()=>number}).__realNow;});
 // The partial take (~1.4 s of real audio) still lands as a normal import.
 await expect(page.locator('[data-testid=arrange-clip]')).toHaveCount(2,{timeout:15000});
 expect(await mic(page,'__micLive')).toBe(0);
});
