import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeSessionWav,decodeSessionWav} from './sessionWav';
import {isNeutralSoundExport,infoChunk,readWavInfo,renderSoundExport,soundExportFileName,soundExportSchema,soundOptionsToValues,valuesToSoundOptions,wavSampleFormat,SOUND_EXPORT_DEFAULTS as D} from './exportWav';
const src=()=>encodeSessionWav([Float32Array.from([0,0.5,-0.25,0.1]),Float32Array.from([0,0.25,-0.75,0.1])],48000);
test('schema: name required, normalise level only shows when normalising',()=>{
 const s=soundExportSchema();
 assert.equal(s.validate(soundOptionsToValues(D)),'export.error.name');
 assert.equal(s.validate({...soundOptionsToValues(D),name:'take'}),null);
 const vis=(v:Record<string,string|number|boolean>)=>s.fields.filter(f=>!f.visibleWhen||f.visibleWhen(v)).map(f=>f.id);
 assert.ok(!vis({normalize:false}).includes('normalizeDb'));assert.ok(vis({normalize:true}).includes('normalizeDb'));
});
test('options: bad values fall back, normalise level is clamped',()=>{
 const o=valuesToSoundOptions({bitDepth:'8',channels:'x',normalize:true,normalizeDb:12});
 assert.equal(o.bitDepth,'source');assert.equal(o.channels,'keep');assert.equal(o.normalizeDb,0);
 assert.equal(valuesToSoundOptions({normalizeDb:-99}).normalizeDb,-24);
});
test('neutral options save the engine bytes untouched',()=>{
 assert.equal(isNeutralSoundExport({...D,name:'a'}),true);
 assert.equal(isNeutralSoundExport({...D,name:'a',metaTitle:'x'}),false);
 assert.equal(isNeutralSoundExport({...D,name:'a',bitDepth:'16'}),false);
});
test('16-bit and 24-bit output decode back to the same audio within quantisation',()=>{
 for(const [bd,bits,tol] of [['16',16,1/32000],['24',24,1/8000000]] as const){
  const r=renderSoundExport(src(),{...D,name:'a',bitDepth:bd});
  assert.deepEqual(wavSampleFormat(r.wav),{bits,float:false});
  const d=decodeSessionWav('x',r.wav);const o=decodeSessionWav('o',src());
  for(let c=0;c<2;c++)for(let i=0;i<4;i++)assert.ok(Math.abs(d.channels[c][i]-o.channels[c][i])<=tol,`${bd} ${c} ${i}`);
 }
});
test('32-bit float keeps samples exactly; mono mixes down; size matches the header',()=>{
 const r=renderSoundExport(src(),{...D,name:'a',bitDepth:'32f',channels:'mono'});
 assert.deepEqual(wavSampleFormat(r.wav),{bits:32,float:true});assert.equal(r.channels,1);
 const d=decodeSessionWav('x',r.wav);assert.deepEqual([...d.channels[0]].map(v=>Math.round(v*1e4)/1e4),[0,0.375,-0.5,0.1]);
 assert.equal(r.wav.byteLength,44+4*4);assert.equal(new DataView(r.wav).getUint32(4,true),r.wav.byteLength-8);
});
test('peak normalisation reaches the requested level',()=>{
 const r=renderSoundExport(src(),{...D,name:'a',normalize:true,normalizeDb:-6});
 assert.ok(Math.abs(r.peakDb!+6)<0.001);
 const d=decodeSessionWav('x',r.wav);const peak=Math.max(...d.channels.flatMap(c=>[...c].map(Math.abs)));
 assert.ok(Math.abs(peak-Math.pow(10,-6/20))<0.0005);
});
test('INFO tags round-trip, stay word aligned and keep the file valid',()=>{
 const meta={metaTitle:'Take 3',metaAuthor:'Ana',metaCopyright:'(c) 2026',metaDescription:'line1\nline2 é'};
 for(const bd of ['16','24','32f'] as const){
  const r=renderSoundExport(src(),{...D,name:'a',bitDepth:bd,...meta});
  assert.deepEqual(readWavInfo(r.wav),{INAM:'Take 3',IART:'Ana',ICOP:'(c) 2026',ICMT:'line1 line2 ?'});
  assert.equal(new DataView(r.wav).getUint32(4,true),r.wav.byteLength-8);assert.equal(r.wav.byteLength%2,0);
  assert.equal(decodeSessionWav('x',r.wav).channels[0].length,4);
 }
 assert.equal(infoChunk(D).length,0);
});
test('file names get a single .wav and lose path characters',()=>{
 assert.equal(soundExportFileName('take.wav'),'take.wav');assert.equal(soundExportFileName('a/b:c'),'a_b_c.wav');assert.equal(soundExportFileName('  '),'audio.wav');
});
