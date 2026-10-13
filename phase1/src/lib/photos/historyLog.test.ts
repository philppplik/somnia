import test from 'node:test';
import assert from 'node:assert/strict';
import {describeChange,historyEntries,historyTimeline,stepsTo} from './historyLog';
import {neutralPhotoSettings as n,type PhotoSettings} from './studioSettings';
const s=(p:Partial<PhotoSettings>):PhotoSettings=>({...n,...p});
test('describeChange lists exactly the changed keys, crop compared by value',()=>{
 assert.deepEqual(describeChange(n,n),[]);
 assert.deepEqual(describeChange(n,s({exposure:1,flipH:true})).map(c=>c.key),['exposure','flipH']);
 const c={x0:0,y0:0,x1:0.5,y1:0.5};assert.deepEqual(describeChange(s({crop:c}),s({crop:{...c}})),[]);
 assert.equal(describeChange(s({crop:c}),s({crop:null}))[0].to,null);
});
test('timeline is past, now, future in time order; entries flag the current one',()=>{
 const a=s({exposure:1}),b=s({exposure:2}),c=s({exposure:3});
 const session={past:[n,a],now:b,future:[c]};
 assert.deepEqual(historyTimeline(session),[n,a,b,c]);
 const e=historyEntries(session);
 assert.deepEqual(e.map(x=>x.current),[false,false,true,false]);assert.deepEqual(e.map(x=>x.status),['done','done','done','undone']);
 assert.deepEqual(e[0].changes,[]);assert.equal(e[1].changes[0].key,'exposure');assert.equal(e[3].changes[0].to,3);
});
test('stepsTo is negative for undo, positive for redo, null out of range',()=>{
 const session={past:[n,n],future:[n,n,n]};
 assert.equal(stepsTo(session,2),0);assert.equal(stepsTo(session,0),-2);assert.equal(stepsTo(session,4),2);assert.equal(stepsTo(session,5),3);assert.equal(stepsTo(session,6),null);assert.equal(stepsTo(session,-1),null);assert.equal(stepsTo(session,1.5),null);
});
