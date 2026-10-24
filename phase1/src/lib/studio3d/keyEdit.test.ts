import test from 'node:test';import assert from 'node:assert/strict';
import {groupRefs,keyIndices,copyTrackKeys,shiftTrackKeys,pasteTrackKeys,type TrackData} from './keyEdit';
const track=(times:number[],eases:TrackData['eases']=[]):TrackData=>({times,values:times.flatMap(t=>[t,0,0]),eases:times.map((_,i)=>eases[i]??'linear')});
test('groupRefs validates and groups per path, sorted and deduplicated',()=>{
 assert.deepEqual(groupRefs([{path:'scale',time:2},{path:'position',time:1},{path:'position',time:1}]),[{path:'scale',times:[2]},{path:'position',times:[1]}]);
 assert.throws(()=>groupRefs([]),/Select keys/);
 assert.throws(()=>groupRefs([{path:'bones' as never,time:0}]),/position, rotation or scale/);
 assert.throws(()=>groupRefs([{path:'position',time:-1}]),/Time must be/);
});
test('copyTrackKeys returns values and easing sorted by time, with own copies',()=>{
 const t=track([0,1,2],['step','easeIn','linear']);
 const c=copyTrackKeys(t,'position',[2,0]);
 assert.deepEqual(c.map(k=>k.time),[0,2]);assert.deepEqual(c.map(k=>k.ease),['step','linear']);
 assert.deepEqual(c[0].value,[0,0,0]);assert.deepEqual(c[1].value,[2,0,0]);
 c[0].value[0]=99;assert.equal(t.values[0],0);
});
test('shiftTrackKeys moves keys with their easing, clamps at 0 and keeps order',()=>{
 const t=track([0.5,1,2],['step','easeIn','easeOut']);
 const r=shiftTrackKeys(t,'position',[0,2],0.25);
 assert.deepEqual(r.times,[0.75,1,2.25]);assert.deepEqual(r.eases,['step','easeIn','easeOut']);
 assert.deepEqual(r.values.slice(0,3),[0.5,0,0]);
 const z=shiftTrackKeys(t,'position',[0],-2);
 assert.deepEqual(z.times,[0,1,2]);assert.deepEqual(z.eases,['step','easeIn','easeOut']);
});
test('shiftTrackKeys refuses to land on a staying key or to overlap',()=>{
 const t=track([0,1,2]);
 assert.throws(()=>shiftTrackKeys(t,'position',[0],1),/land on another key/);
 assert.throws(()=>shiftTrackKeys(t,'position',[0,1],-1),/overlap/);
 assert.throws(()=>shiftTrackKeys(t,'position',[0],Number.NaN),/finite/);
});
test('pasteTrackKeys offsets to the playhead, replaces taken times and pads easing',()=>{
 const src=track([0,1],['step','easeOut']);const keys=copyTrackKeys(src,'position',[0,1]);
 const r=pasteTrackKeys(track([2]),'position',keys,2);
 assert.deepEqual(r.times,[2,3]);assert.deepEqual(r.eases,['step','easeOut']);assert.deepEqual(r.values.slice(3,6),[1,0,0]);
 const e=pasteTrackKeys(undefined,'position',keys,1.5);
 assert.deepEqual(e.times,[1.5,2.5]);assert.deepEqual(e.eases,['step','easeOut']);
});
test('keyIndices names missing keys',()=>{
 assert.deepEqual(keyIndices(track([0,1]),[1,0]),[1,0]);
 assert.throws(()=>keyIndices(track([0]),[0.5]),/no key at that time/);
});
