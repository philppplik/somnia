import test from 'node:test';import assert from 'node:assert/strict';
import {easeAt,slerp,bakeTrack,isEase,EASES,BAKE_STEPS} from './ease';
test('every easing starts at 0 and ends at 1; ease in is slow first, ease out fast first',()=>{
 for(const e of EASES){assert.equal(easeAt(e,0),0);assert.equal(easeAt(e,1),1);}
 assert.ok(easeAt('easeIn',0.5)<0.5);assert.ok(easeAt('easeOut',0.5)>0.5);assert.equal(easeAt('easeInOut',0.5),0.5);assert.equal(easeAt('step',0.99),0);assert.equal(easeAt('linear',2),1);assert.equal(easeAt('linear',-1),0);
});
test('isEase only accepts known names',()=>{assert.equal(isEase('step'),true);assert.equal(isEase('bounce'),false);assert.equal(isEase(1),false);});
test('slerp between identity and a 180 degree turn halfway is a 90 degree turn, and takes the short way',()=>{
 const m=slerp([0,0,0,1],[0,1,0,0],0.5);assert.ok(Math.abs(m[1]-Math.SQRT1_2)<1e-9&&Math.abs(m[3]-Math.SQRT1_2)<1e-9);
 const s=slerp([0,0,0,1],[0,0,0,-1],0.5);assert.ok(Math.abs(Math.abs(s[3])-1)<1e-9);
});
test('bakeTrack leaves linear tracks alone and keeps the authoring keys',()=>{
 const r=bakeTrack([0,1],[0,0,0,1,1,1],'position',['linear','linear']);assert.deepEqual(r.times,[0,1]);
 const b=bakeTrack([0,1,2],[0,0,0,1,1,1,2,2,2],'position',['easeIn','linear','linear']);
 assert.equal(b.times.length,3+BAKE_STEPS-1);assert.equal(b.times[0],0);assert.equal(b.times[BAKE_STEPS],1);assert.equal(b.times.at(-1),2);assert.equal(b.values.length,b.times.length*3);
 assert.ok(b.values[3*(BAKE_STEPS/2)]<0.5,'eased in: halfway in time is less than halfway in value');
});
test('a step holds the start value until just before the next key',()=>{
 const r=bakeTrack([0,1],[0,0,0,5,5,5],'position',['step','linear']);
 assert.deepEqual(r.times,[0,0.999,1]);assert.deepEqual(r.values,[0,0,0,0,0,0,5,5,5]);
});
test('eased rotation stays a unit quaternion',()=>{
 const r=bakeTrack([0,1],[0,0,0,1,0,1,0,0],'rotation',['easeOut','linear']);
 for(let i=0;i<r.times.length;i++)assert.ok(Math.abs(Math.hypot(...r.values.slice(i*4,i*4+4))-1)<1e-9);
});
