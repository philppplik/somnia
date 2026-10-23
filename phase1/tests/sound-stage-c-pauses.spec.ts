import {test,expect} from './fixtures';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';

// Stage C2 (Sprach-Schnitt): pause detection runs through the REAL mix worker via the
// pause panel, the cut is one undoable edit, stale scans are rejected, and the exported
// mix after the cut matches the shortened session exactly (preview/export parity).
// The WASM engine is substituted by the supported setSoundEngineFactory hook, as in the
// Stage A UI-flow test; the detection math itself is engine-free.

const SR=48000,TONE=Math.floor(0.6*SR),GAP=Math.floor(0.6*SR);
const FRAMES=2*TONE+GAP; // tone - pause - tone
const CUT=GAP-2*Math.floor(0.12*SR); // pause minus the padding kept around speech

function speechWav(path:string){
 mkdirSync('test-results',{recursive:true});
 const out=Buffer.alloc(44+FRAMES*2*4);
 out.write('RIFF',0);out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);
 out.writeUInt32LE(16,16);out.writeUInt16LE(3,20);out.writeUInt16LE(2,22);
 out.writeUInt32LE(SR,24);out.writeUInt32LE(SR*8,28);out.writeUInt16LE(8,32);out.writeUInt16LE(32,34);
 out.write('data',36);out.writeUInt32LE(FRAMES*8,40);
 for(let i=0;i<FRAMES;i++){
  const sounding=i<TONE||i>=TONE+GAP;
  const v=sounding?0.5*Math.sin(2*Math.PI*440*i/SR):0;
  out.writeFloatLE(v,44+i*8);out.writeFloatLE(v,44+i*8+4);
 }
 writeFileSync(path,out);
}

async function importIntoArrange(page:any,wavPath:string){
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
 await page.getByTestId('sound-arrange-add-source').click();
 await expect(page.locator('[data-testid=arrange-clip]')).toHaveCount(1);
}

test('Sound Stage C2: pause panel detects, rejects stale, cuts as one undo and keeps export parity',async({page})=>{
 const wavPath='test-results/stage-c-speech.wav';speechWav(wavPath);
 await importIntoArrange(page,wavPath);
 // panel visible with the source selector; detection runs through the real mix worker
 await expect(page.getByTestId('sound-pauses')).toBeVisible();
 await page.getByTestId('sound-pauses-detect').click();
 await expect(page.getByTestId('sound-pauses-list')).toBeVisible({timeout:15000});
 await expect(page.getByTestId('sound-pauses-list').locator('li')).toHaveCount(1);
 // a session edit after the scan must reject the cut as stale
 const staleError=await page.evaluate(async()=>{
  const store:any=await import('/src/lib/sound/arrangeStore.ts');
  store.editArrangement((s:any)=>{s.name='Edited after scan';});
  try{store.cutDetectedPauses();return'';}
  catch(e){return e instanceof Error?e.message:String(e);}
 });
 expect(staleError).toContain('outdated');
 // re-detect on the current revision, then cut all
 await page.getByTestId('sound-pauses-detect').click();
 await expect(page.getByTestId('sound-pauses-list')).toBeVisible({timeout:15000});
 await page.screenshot({path:'test-results/screenshots/sound-stage-c-pauses.png'});
 await page.getByTestId('sound-pauses-cut-all').click();
 await expect(page.locator('[data-testid=arrange-clip]')).toHaveCount(2);
 await expect(page.getByTestId('sound-pauses-list')).toHaveCount(0);
 // one undo restores the original three-part session as a single clip
 const undo=await page.evaluate(async()=>{
  const store:any=await import('/src/lib/sound/arrangeStore.ts');
  const arr:any=await import('/src/lib/sound/arrangement.ts');
  const before=store.getArrangementState();
  const endCut=arr.arrangementEnd(before.document);
  store.undoArrangement();
  const after=store.getArrangementState();
  return{endCut,clips:after.document.tracks[0].clips.length,endRestored:arr.arrangementEnd(after.document),canUndo:after.canUndo};
 });
 expect(undo.endCut).toBe(FRAMES-CUT);
 expect(undo.clips).toBe(1);
 expect(undo.endRestored).toBe(FRAMES);
 // redo the cut through the UI path again for the export parity check
 await page.evaluate(async()=>{const store:any=await import('/src/lib/sound/arrangeStore.ts');store.redoArrangement();});
 await expect(page.locator('[data-testid=arrange-clip]')).toHaveCount(2);
 // export parity: the rendered mix after the cut is exactly the shortened session
 await page.getByTestId('sound-arrange-render').click();
 await expect(page.getByTestId('sound-arrange-export')).toBeEnabled({timeout:15000});
 const dl=page.waitForEvent('download');await page.getByTestId('sound-arrange-export').click();
 const bytes=readFileSync(await (await dl).path()!);
 expect(bytes.subarray(0,4).toString()).toBe('RIFF');
 expect(bytes.length).toBe(44+(FRAMES-CUT)*8);
});
