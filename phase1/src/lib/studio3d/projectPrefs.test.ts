import test from 'node:test';
import assert from 'node:assert/strict';
import {readProjectUnit,writeProjectUnit,type KeyValueStore} from './projectPrefs';
const mem=():KeyValueStore&{data:Record<string,string>}=>{const data:Record<string,string>={};return{data,getItem:k=>k in data?data[k]:null,setItem:(k,v)=>{data[k]=v;}};};
test('unit is stored per project and defaults to metres',()=>{
 const s=mem();assert.equal(readProjectUnit(s,'a'),'m');
 writeProjectUnit(s,'a','mm');writeProjectUnit(s,'b','in');
 assert.equal(readProjectUnit(s,'a'),'mm');assert.equal(readProjectUnit(s,'b'),'in');assert.equal(readProjectUnit(s,'c'),'m');
 writeProjectUnit(s,'a','m');assert.equal(readProjectUnit(s,'a'),'m');assert.ok(!('a' in JSON.parse(Object.values(s.data)[0])),'metres is the default and is not stored');
});
test('damaged or hostile storage is ignored',()=>{
 const s=mem();s.setItem('somnia.studio3d.units.v1','{not json');assert.equal(readProjectUnit(s,'a'),'m');
 s.setItem('somnia.studio3d.units.v1',JSON.stringify({a:'parsec',__proto__:'mm',b:'cm'}));assert.equal(readProjectUnit(s,'a'),'m');assert.equal(readProjectUnit(s,'b'),'cm');
 s.setItem('somnia.studio3d.units.v1','[1]');assert.equal(readProjectUnit(s,'0'),'m');
 const broken:KeyValueStore={getItem:()=>{throw new Error('x');},setItem:()=>{throw new Error('x');}};assert.equal(readProjectUnit(broken,'a'),'m');writeProjectUnit(broken,'a','mm');
});
test('the stored map is capped',()=>{
 const s=mem();for(let i=0;i<260;i++)writeProjectUnit(s,'p'+i,'mm');
 assert.equal(readProjectUnit(s,'p0'),'m');assert.equal(readProjectUnit(s,'p259'),'mm');
});
