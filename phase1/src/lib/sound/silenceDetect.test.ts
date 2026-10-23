import {test} from 'node:test';import assert from 'node:assert/strict';
import {detectSilenceCuts} from './silenceDetect';

const SR=48000;
const tone=(frames:number,amp=0.5)=>new Float32Array(frames).fill(amp);
const quiet=(frames:number)=>new Float32Array(frames);
const stereo=(left:Float32Array,right?:Float32Array):[Float32Array,Float32Array]=>[left,right??left.slice()];
const concat=(...parts:Float32Array[])=>{const out=new Float32Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;};

test('speech - pause - speech yields one cut range with padding kept around speech',()=>{
 const buf=concat(tone(SR),quiet(SR),tone(SR)); // 1s speech, 1s pause, 1s speech
 const cuts=detectSilenceCuts(stereo(buf));
 assert.equal(cuts.length,1);
 const c=cuts[0];
 assert.ok(Math.abs(c.silenceStart-SR)<=960,'silence starts at ~1s');
 assert.ok(Math.abs(c.silenceEnd-2*SR)<=960,'silence ends at ~2s');
 assert.equal(c.durationFrames,c.silenceEnd-c.silenceStart);
 assert.equal(c.cutStart,c.silenceStart+Math.round(0.12*SR),'leading padding kept');
 assert.equal(c.cutEnd,c.silenceEnd-Math.round(0.12*SR),'trailing padding kept');
});

test('continuous tone has no silence',()=>{
 assert.deepEqual(detectSilenceCuts(stereo(tone(2*SR))),[]);
});

test('fully silent buffer yields one whole-buffer segment with no padding',()=>{
 const cuts=detectSilenceCuts(stereo(quiet(SR)));
 assert.equal(cuts.length,1);
 assert.equal(cuts[0].cutStart,0);
 assert.equal(cuts[0].cutEnd,SR);
 assert.equal(cuts[0].durationFrames,SR);
});

test('pause shorter than minSilenceMs is ignored',()=>{
 const buf=concat(tone(SR),quiet(Math.round(0.2*SR)),tone(SR)); // 200 ms pause, default min 400 ms
 assert.deepEqual(detectSilenceCuts(stereo(buf)),[]);
});

test('honours a custom minimum duration',()=>{
 const buf=concat(tone(SR),quiet(Math.round(0.2*SR)),tone(SR));
 const cuts=detectSilenceCuts(stereo(buf),{minSilenceMs:100,paddingMs:40});
 assert.equal(cuts.length,1);
});

test('pause too short to survive padding is dropped',()=>{
 const buf=concat(tone(SR),quiet(Math.round(0.15*SR)),tone(SR)); // 150 ms pause < 2x120 ms padding
 const cuts=detectSilenceCuts(stereo(buf),{minSilenceMs:100});
 assert.deepEqual(cuts,[]);
});

test('two pauses produce two ordered segments',()=>{
 const buf=concat(tone(SR/2),quiet(SR),tone(SR/2),quiet(SR),tone(SR/2));
 const cuts=detectSilenceCuts(stereo(buf));
 assert.equal(cuts.length,2);
 assert.ok(cuts[0].silenceEnd<=cuts[1].silenceStart,'ordered and non-overlapping');
});

test('signal only in the left channel is not silence',()=>{
 const cuts=detectSilenceCuts([tone(SR),quiet(SR)]);
 assert.deepEqual(cuts,[]);
});

test('threshold region: just above is speech, just below is silence',()=>{
 assert.deepEqual(detectSilenceCuts(stereo(tone(SR,Math.pow(10,-44/20)))),[],' -44 dB stays speech');
 const below=detectSilenceCuts(stereo(tone(SR,Math.pow(10,-46/20))));
 assert.equal(below.length,1,' -46 dB reads as silence');
});

test('deterministic: identical input gives identical output',()=>{
 const buf=concat(tone(SR),quiet(SR),tone(SR));
 assert.deepEqual(detectSilenceCuts(stereo(buf)),detectSilenceCuts(stereo(buf)));
});

test('invalid channels throw',()=>{
 assert.throws(()=>detectSilenceCuts([new Float32Array(10),new Float32Array(5)]));
 assert.throws(()=>detectSilenceCuts(stereo(new Float32Array(0))));
});
