import test from 'node:test';import assert from 'node:assert/strict';
import {createContextStore} from './contextStore';
test('claim resets and report merges',()=>{
 const s=createContextStore();let n=0;s.subscribe(()=>n++);
 const a=s.claim('photos',{id:'d1',kind:'png',dirty:false,readOnly:false});
 assert.equal(s.get().studio,'photos');
 a.report({selection:{kind:'many',count:3},busy:true,services:{core:true}});
 assert.equal(s.get().selection.count,3);assert.equal(s.get().busy,true);assert.equal(s.get().services.core,true);
 a.report({selection:{kind:'none'}});assert.equal(s.get().selection.count,0);
});
test('stale owner cannot overwrite',()=>{
 const s=createContextStore();const a=s.claim('photos');const b=s.claim('code');
 assert.equal(a.report({busy:true}),false);assert.equal(s.get().busy,false);assert.equal(s.get().studio,'code');
 a.release();assert.equal(s.get().studio,'code');
 assert.equal(b.report({busy:true}),true);b.release();assert.equal(s.get().studio,'');
});
test('identical report does not notify',()=>{
 const s=createContextStore();let n=0;const a=s.claim('x');s.subscribe(()=>n++);
 a.report({busy:true});a.report({busy:true});assert.equal(n,1);
});
