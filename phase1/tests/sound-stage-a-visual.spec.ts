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
