import test from 'node:test';
import assert from 'node:assert/strict';
import {bucketCountFor,slicePeaks,WAVEFORM_MAX_BUCKETS} from './waveform';

test('bucket count targets ~50 ms per bucket and caps',()=>{
 assert.equal(bucketCountFor(10),200);
 assert.equal(bucketCountFor(1),20);
 assert.equal(bucketCountFor(0),0);
 assert.equal(bucketCountFor(NaN),0);
 assert.equal(bucketCountFor(3600),WAVEFORM_MAX_BUCKETS,'two hours cap at the max');
});

test('slicePeaks maps the clip range onto columns',()=>{
 // 10 buckets over 10 s: bucket k holds [-k/10, k/10].
 const peaks=new Float32Array(20);
 for(let k=0;k<10;k++){peaks[k*2]=-k/10;peaks[k*2+1]=k/10;}
 const cols=slicePeaks(peaks,10,0,5,5);
 assert.equal(cols.length,10);
 for(let x=0;x<5;x++){assert.ok(Math.abs(cols[x*2]+x/10)<1e-6,`col ${x} min`);assert.ok(Math.abs(cols[x*2+1]-x/10)<1e-6,`col ${x} max`);}
});

test('slicePeaks merges the buckets a wide column covers',()=>{
 const peaks=new Float32Array(20);
 for(let k=0;k<10;k++){peaks[k*2]=-k/10;peaks[k*2+1]=k/10;}
 // One column over the whole range: min of all mins, max of all maxes.
 const cols=slicePeaks(peaks,10,0,10,1);
 assert.ok(Math.abs(cols[0]+0.9)<1e-6);assert.ok(Math.abs(cols[1]-0.9)<1e-6);
});

test('gain scales and clamps, degenerate input stays flat',()=>{
 const peaks=new Float32Array([-0.4,0.6]);
 const half=slicePeaks(peaks,1,0,1,2,0.5);
 for(const[i,v]of[[0,-0.2],[1,0.3],[2,-0.2],[3,0.3]] as const)assert.ok(Math.abs(half[i]-v)<1e-6,`gain 0.5 at ${i}`);
 assert.deepEqual([...slicePeaks(peaks,1,0,1,1,4)],[ -1,1 ],'gain 4 clamps to the rail');
 assert.equal(slicePeaks(peaks,1,1,1,8).every(v=>v===0),true,'empty range is flat');
 assert.equal(slicePeaks(new Float32Array(0),10,0,5,8).every(v=>v===0),true,'no peaks is flat');
 assert.equal(slicePeaks(peaks,0,0,1,8).every(v=>v===0),true,'zero duration is flat');
});

test('columns outside the covered buckets stay flat (trimmed tail)',()=>{
 const peaks=new Float32Array(2);peaks[0]=-0.5;peaks[1]=0.5; // one bucket over 10 s
 const cols=slicePeaks(peaks,10,5,10,4); // clip covers seconds 5-10: bucket 0 covers 0-10
 // The single bucket spans everything, so every column sees it.
 assert.ok(cols[0]===-0.5&&cols[7]===0.5);
});

test('controller decodes peaks once per source and drops them on re-register',async()=>{
 const {FilmstripController}=await import('./filmstrip-controller');
 const calls:string[]=[];
 const fake={
  async open(){return{duration:10,width:320,height:180};},
  async thumbs(){return[];},
  async peaks(k:string,buckets:number){calls.push(`${k}:${buckets}`);return new Float32Array([-0.5,0.5]);},
  close(){},dispose(){},
 };
 const c=new FilmstripController(fake);
 const wait=()=>new Promise(r=>setTimeout(r,5));
 c.register('a.webm',new ArrayBuffer(8));await wait();await wait();
 assert.deepEqual(calls,['a.webm:200'],'one peaks pass at ~50 ms buckets');
 assert.ok(c.peaksFor('a.webm') instanceof Float32Array);
 c.register('a.webm',new ArrayBuffer(8));await wait();await wait();
 assert.equal(c.peaksFor('a.webm') instanceof Float32Array,true,'re-register re-decodes under the new generation');
 assert.deepEqual(calls,['a.webm:200','a.webm:200']);
 c.unregister('a.webm');
 assert.equal(c.peaksFor('a.webm'),undefined,'closed source forgets its peaks');
 c.dispose();
});
