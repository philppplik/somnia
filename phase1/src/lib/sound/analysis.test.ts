import {test} from 'node:test';import assert from 'node:assert/strict';import {spectrumPower,basicAnalysis} from './analysis';
test('Hann spectrum full-scale bin-centred tone is near 0 dB and opposite stereo phase does not cancel',()=>{const tone=Float32Array.from({length:4096},(_,i)=>Math.sin(2*Math.PI*100*i/4096));const bins=spectrumPower([tone,Float32Array.from(tone,v=>-v)]);assert.ok(Math.abs(bins[100])<0.001);assert.equal(bins.indexOf(Math.max(...bins)),100);assert.ok(bins[200]<-100);});
test('half-amplitude stereo reads -6.02 dB and silence is floored without fake LUFS',()=>{const tone=Float32Array.from({length:4096},(_,i)=>0.5*Math.sin(2*Math.PI*30*i/4096));assert.ok(Math.abs(spectrumPower([tone,tone])[30]+6.0206)<0.001);const silence=basicAnalysis([new Float32Array(48000),new Float32Array(48000)]);assert.equal(silence.integratedLufs,null);assert.equal(silence.truePeakDb,null);assert.equal(silence.samplePeakDb,null);assert.ok(silence.spectrumDb.every(v=>v===-140));});
test('short audio and malformed PCM are explicit',()=>{assert.equal(basicAnalysis([new Float32Array(100),new Float32Array(100)]).loudnessStatus,'insufficient');assert.throws(()=>basicAnalysis([Float32Array.of(NaN),Float32Array.of(0)]));});
import {spectrumPowerAverage} from './analysis';
test('averaged spectrum spans the whole render: energy only in the second half is visible',()=>{
 const left=new Float32Array(8192),right=new Float32Array(8192);
 for(let i=4096;i<8192;i++){left[i]=Math.sin(2*Math.PI*100*(i-4096)/4096);right[i]=left[i];}
 const avg=spectrumPowerAverage([left,right]);
 assert.equal(avg.windows,4,'8192 frames at 2048 hop');
 assert.ok(avg.spectrumDb[100]>-20,'tone in the second half is present in the average');
 assert.equal(spectrumPower([left,right])[100],-140,'the first window alone misses it');
});
test('averaged spectrum of a constant tone matches the single-window value; silence stays floored',()=>{
 const tone=Float32Array.from({length:4096*3},(_,i)=>Math.sin(2*Math.PI*100*i/4096));
 const avg=spectrumPowerAverage([tone,tone]);
 assert.equal(avg.windows,6);
 const single=spectrumPower([tone,tone])[100],diff=avg.spectrumDb[100]-single;
 assert.ok(diff<=0&&diff>-0.6,`average tracks the single-window level; the final zero-padded window lowers it slightly (${diff.toFixed(3)} dB)`);
 const silence=spectrumPowerAverage([new Float32Array(5000),new Float32Array(5000)]);
 assert.ok(silence.spectrumDb.every(v=>v===-140));
 assert.throws(()=>spectrumPowerAverage([Float32Array.of(0,NaN),Float32Array.of(0,0)]));
});
test('basicAnalysis reports the window count honestly, one window for short input',()=>{
 assert.equal(basicAnalysis([new Float32Array(100),new Float32Array(100)]).spectrumWindows,1);
 assert.equal(basicAnalysis([new Float32Array(48000),new Float32Array(48000)]).spectrumWindows,24);
});
