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

// Stage A functional acceptance, engine-free: real arrangement document, real mixer render
// (gain/pan/mute), real save roundtrip and real WAV encode - no WASM decode needed.
test('Sound Stage A: two-track mixer, save roundtrip and mix export are functional',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.getByRole('radio',{name:'Somnia Sound'}).click();
 await page.getByTestId('sound-create-blank').click();
 await expect(page.getByTestId('sound-workspace')).toBeVisible({timeout:20000});
 await page.getByRole('button',{name:/Arrange|Anordnen/i}).click();
 await expect(page.getByTestId('sound-arrange')).toBeVisible();
 // Two tracks seeded through the real store API: the multitrack timeline shows both.
 await page.evaluate(async()=>{
  const store:any=await import('/src/lib/sound/arrangeStore.ts');
  const arr:any=await import('/src/lib/sound/arrangement.ts');
  store.editArrangement((s:any)=>{
   for(const id of ['t1','t2']){
    const source={id:'src-'+id,name:id+'.wav',frames:48000,sampleRate:48000,channels:2};
    s.sources.push(source);
    const track=arr.newTrack(id,id+'.wav');
    track.clips.push(arr.newClip('clip-'+id,source));
    s.tracks.push(track);
   }
  });
 });
 await expect(page.getByTestId('arrange-clip')).toHaveCount(2);
 await expect(page.getByTestId('sound-arrange-track-curve-toggle')).toHaveCount(2);
 await expect(page.getByTestId('arrange-mixer-track')).toHaveCount(2);
 // mixer cards and lane rows must stay aligned per track (no controls spilling into the next track)
 for(let i=0;i<2;i++){
  const mixer=await page.getByTestId('arrange-mixer-track').nth(i).boundingBox();
  const lane=await page.locator('[data-track-id]').nth(i).boundingBox();
  expect(Math.abs(mixer!.y-lane!.y)).toBeLessThanOrEqual(1);expect(mixer!.height).toBe(lane!.height);
  // every control inside the mixer card must fit the card bounds (equal card heights alone prove nothing)
  const overflow=await page.getByTestId('arrange-mixer-track').nth(i).evaluate(card=>{
   const cb=card.getBoundingClientRect();const bad:string[]=[];
   card.querySelectorAll('button,input,select').forEach(el=>{const b=el.getBoundingClientRect();if(b.bottom>cb.bottom+1||b.right>cb.right+1)bad.push(`${el.tagName}:${el.getAttribute('aria-label')??el.textContent} bottom=${b.bottom.toFixed(0)} right=${b.right.toFixed(0)} card bottom=${cb.bottom.toFixed(0)} right=${cb.right.toFixed(0)}`);});
   if(card.scrollHeight>card.clientHeight+1)bad.push(`scrollHeight ${card.scrollHeight} > clientHeight ${card.clientHeight}`);
   return bad;
  });
  expect(overflow).toEqual([]);
 }
 await page.getByTestId('arrange-mixer-track').nth(1).scrollIntoViewIfNeeded();
 await page.screenshot({path:'test-results/screenshots/sound-stage-a-two-track-mixer.png'});
 const r=await page.evaluate(async()=>{
  const arr:any=await import('/src/lib/sound/arrangement.ts');
  const rr:any=await import('/src/lib/sound/rackRender.ts');
  const wav:any=await import('/src/lib/sound/sessionWav.ts');
  const doc=arr.emptyArrangement('Stage A check');
  const mk=(id:string)=>{const source={id:'src-'+id,name:id+'.wav',frames:48000,sampleRate:48000,channels:2};doc.sources.push(source);const t=arr.newTrack(id,id);t.clips.push(arr.newClip('clip-'+id,source));doc.tracks.push(t);};
  mk('t1');mk('t2');
  const full=(v:number)=>new Float32Array(48000).fill(v);
  const decoded=[{id:'src-t1',sampleRate:48000,channels:[full(0.5),full(0.5)]},{id:'src-t2',sampleRate:48000,channels:[full(0.25),full(0.25)]}];
  const idp=(ch:[Float32Array,Float32Array])=>ch;
  const base=rr.renderRackedArrangement(doc,decoded,idp);
  const muted=rr.renderRackedArrangement({...doc,tracks:[doc.tracks[0],{...doc.tracks[1],mute:true}]},decoded,idp);
  const panned=rr.renderRackedArrangement({...doc,tracks:[{...doc.tracks[0],pan:1},doc.tracks[1]]},decoded,idp);
  const rms=(ch:Float32Array)=>Math.sqrt(ch.reduce((a:number,b:number)=>a+b*b,0)/ch.length);
  const roundtrip=arr.serializeArrangement(arr.parseArrangement(arr.serializeArrangement(doc)));
  const wavBytes=wav.encodeSessionWav(base.channels,48000);
  const head=String.fromCharCode(...new Uint8Array(wavBytes,0,4));
  return{peakAll:base.peak,peakMuted:muted.peak,panL:rms(panned.channels[0]),panR:rms(panned.channels[1]),
   saved:roundtrip===arr.serializeArrangement(doc),wavHead:head,wavBytes:wavBytes.byteLength};
 });
 // Mixer: both tracks sum; muting one removes exactly its signal; pan=1 moves the track fully right.
 expect(r.peakAll).toBeGreaterThan(0.74);expect(r.peakAll).toBeLessThan(0.76);
 expect(r.peakMuted).toBeGreaterThan(0.49);expect(r.peakMuted).toBeLessThan(0.51);
 expect(r.panL).toBeGreaterThan(0.24);expect(r.panL).toBeLessThan(0.26);expect(r.panR).toBeGreaterThan(0.74);
 // Save: serialize/parse roundtrip is stable. Export: a real RIFF/WAV of the rendered mix.
 expect(r.saved).toBe(true);
 expect(r.wavHead).toBe('RIFF');expect(r.wavBytes).toBeGreaterThan(44);
});

// Stage A UI flow: import opened audio into the arrangement, render the mix through
// the real mix worker, save the session JSON and export the mix WAV - all through the
// actual toolbar buttons. The WASM engine is substituted by an in-page WAV decoder via
// the supported setSoundEngineFactory hook, so the test runs without the built engine;
// codec coverage stays with the engine-backed sound-studio spec.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const FRAMES=4800;// 0.1 s at 48 kHz keeps the worker render fast
function toneWav(path:string){
 mkdirSync('test-results',{recursive:true});
 const out=Buffer.alloc(44+FRAMES*2*4);
 out.write('RIFF',0);out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);
 out.writeUInt32LE(16,16);out.writeUInt16LE(3,20);out.writeUInt16LE(2,22);
 out.writeUInt32LE(48000,24);out.writeUInt32LE(48000*8,28);out.writeUInt16LE(8,32);out.writeUInt16LE(32,34);
 out.write('data',36);out.writeUInt32LE(FRAMES*8,40);
 for(let i=0;i<FRAMES;i++){
  out.writeFloatLE(0.5*Math.sin(2*Math.PI*440*i/48000),44+i*8);
  out.writeFloatLE(0.25*Math.sin(2*Math.PI*660*i/48000),44+i*8+4);
 }
 writeFileSync(path,out);
}
test('Sound Stage A: UI flow imports audio, renders the mix, saves session JSON and exports a real mix WAV',async({page})=>{
 const wavPath='test-results/stage-a-tone.wav';toneWav(wavPath);
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
    for(let c=0;c<400;c++){const from=Math.floor(c*frames/400),to=Math.max(from+1,Math.floor((c+1)*frames/400));let lo=0,hi=0;for(let i=from;i<to;i++)for(const ch of src.channels){lo=Math.min(lo,ch[i]);hi=Math.max(hi,ch[i]);}peaks[c*2]=lo;peaks[c*2+1]=hi;}
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
 await page.getByTestId('sound-arrange-add-source').click();
 await expect(page.locator('[data-testid=arrange-clip]')).toHaveCount(1);
 await page.getByTestId('sound-arrange-render').click();
 await expect(page.getByTestId('sound-arrange-export')).toBeEnabled({timeout:15000});
 await page.screenshot({path:'test-results/screenshots/sound-stage-a-ui-flow.png'});
 const saveDl=page.waitForEvent('download');await page.getByTestId('sound-arrange-save').click();
 const saved=JSON.parse(readFileSync(await (await saveDl).path()!,'utf8'));
 expect(saved.sources).toHaveLength(1);expect(saved.tracks).toHaveLength(1);expect(saved.tracks[0].clips).toHaveLength(1);
 const dl=page.waitForEvent('download');await page.getByTestId('sound-arrange-export').click();
 const d=await dl;expect(d.suggestedFilename()).toMatch(/-mix\.wav$/);
 const bytes=readFileSync(await d.path()!);
 expect(bytes.subarray(0,4).toString()).toBe('RIFF');expect(bytes.subarray(8,12).toString()).toBe('WAVE');
 expect(bytes.length).toBe(44+FRAMES*8);
 // browser context: the download notice proves the non-desktop (no Tauri save port) path
 await expect(page.getByText(/Download started|Download gestartet/)).toBeVisible();
});

// Desktop save port wiring: with a mocked Tauri IPC bridge the export flow must call
// audio_save_pick, then write the rendered WAV via audio_save_write with the single-use
// token in the x-somnia-token header. This proves the JS<->invoke contract incl. token
// binding; the real OS dialog and the Rust side are covered separately (Rust unit tests
// in audio_io.rs run in CI), not here.
test('Sound Stage A: desktop export writes the mix through the save port with its grant token',async({page})=>{
 const wavPath='test-results/stage-a-tone.wav';toneWav(wavPath);
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
  const calls:{cmd:string,args:any,bytes?:number,token?:string}[]=[];
  (window as any).isTauri=true;(window as any).__TAURI_INTERNALS__={invoke:async(cmd:string,args?:any,options?:any)=>{
   if(cmd==='audio_save_pick'){calls.push({cmd,args});return{token:'grant-token-1'};}
   if(cmd==='audio_save_write'){calls.push({cmd,args:'(raw body)',bytes:(args as ArrayBuffer)?.byteLength??(args as Uint8Array)?.byteLength,token:(options?.headers as Record<string,string>|undefined)?.['x-somnia-token']});return;}
   throw new Error('unexpected invoke '+cmd);
  }};
  (window as any).__TAURI_CALLS__=calls;
 });
 const chooser=page.waitForEvent('filechooser');
 await page.getByTestId('sound-open').click();
 (await chooser).setFiles(wavPath);
 await expect(page.getByTestId('sound-workspace')).toBeVisible();
 await page.getByRole('button',{name:/Arrange & Mix|Arrangement & Mix/}).click();
 await page.getByTestId('sound-arrange-add-source').click();
 await expect(page.locator('[data-testid=arrange-clip]')).toHaveCount(1);
 await page.getByTestId('sound-arrange-render').click();
 await expect(page.getByTestId('sound-arrange-export')).toBeEnabled({timeout:15000});
 await page.getByTestId('sound-arrange-export').click();
 await expect(page.getByText(/Mix saved|Mix gespeichert/)).toBeVisible();
 const calls=await page.evaluate(()=>(window as any).__TAURI_CALLS__);
 expect(calls.map(c=>c.cmd)).toEqual(['audio_save_pick','audio_save_write']);
 expect(calls[0].args).toMatchObject({suggestedName:expect.stringMatching(/-mix\.wav$/)});
 expect(calls[1].token).toBe('grant-token-1');
 expect(calls[1].bytes).toBe(44+FRAMES*8);
});
