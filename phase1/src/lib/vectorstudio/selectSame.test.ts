import test from 'node:test';
import assert from 'node:assert/strict';
import {sameStyleIds} from './selectSame';
import type {VectorDocument} from '../vectorio';

const P=(id:string,fill:string,stroke:string,x:Record<string,unknown>={})=>({id,d:'M0 0L1 1',style:{fill,stroke,strokeWidth:1},...x});
const doc=(...paths:any[])=>({width:100,height:100,paths} as unknown as VectorDocument);
const d=doc(P('a','#FF0000','#000000'),P('b','#ff0000','#111111'),P('c','#00ff00','#000000'),P('d','#ff0000','#000000',{hidden:true}),P('e','#ff0000','#000000',{locked:true}),P('f','#ff0000','#000000'));

test('same fill ignores case, hidden and locked',()=>assert.deepEqual(sameStyleIds(d,['a'],'fill'),['a','b','f']));
test('same stroke',()=>assert.deepEqual(sameStyleIds(d,['a'],'stroke'),['a','c','f']));
test('both',()=>assert.deepEqual(sameStyleIds(d,['a'],'both'),['a','f']));
test('malformed input',()=>{
  assert.throws(()=>sameStyleIds(d,[],'fill'),/Select/);
  assert.throws(()=>sameStyleIds(d,['zz'],'fill'),/Select/);
  assert.throws(()=>sameStyleIds(d,['a'],'x' as any),RangeError);
});
