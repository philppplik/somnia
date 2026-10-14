import test from 'node:test';import assert from 'node:assert/strict';
import {buildExtras,parseExtras} from './clipMeta';
const good={duration:3,tracks:[{node:2,path:'position' as const,times:[0,1,2],ease:['easeIn','linear','step'] as ('easeIn'|'linear'|'step')[]}]};
test('extras round trip',()=>{assert.deepEqual(parseExtras(JSON.parse(JSON.stringify(buildExtras(good)))),good);});
test('a missing or wrong version and non-objects give nothing',()=>{
 for(const v of [undefined,null,5,'x',{},{somnia:null},{somnia:{v:2,tracks:[]}},{other:{v:1}}])assert.equal(parseExtras(v),undefined);
});
test('bad durations are dropped, bad tracks are skipped, good ones stay',()=>{
 const raw={somnia:{v:1,duration:-1,tracks:[{node:-1,path:'position',times:[0],ease:['linear']},{node:1,path:'bogus',times:[0],ease:['linear']},{node:1,path:'scale',times:[0,1],ease:['linear']},
  {node:1,path:'scale',times:[1,0],ease:['linear','linear']},{node:1,path:'scale',times:[0],ease:['bounce']},{node:3,path:'rotation',times:[0,2],ease:['linear','easeOut']},null,7]}};
 const m=parseExtras(raw)!;assert.equal(m.duration,undefined);assert.deepEqual(m.tracks,[{node:3,path:'rotation',times:[0,2],ease:['linear','easeOut']}]);
 assert.equal(parseExtras({somnia:{v:1,duration:1e9,tracks:'x'}})!.duration,undefined);
});
