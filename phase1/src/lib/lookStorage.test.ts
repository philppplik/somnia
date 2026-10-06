import test from 'node:test';
import assert from 'node:assert/strict';
import {readLook,rememberLook,applyLook,DEFAULT_LOOK,LOOK_KEY} from './look';

test('v1 migrates on write without overwriting previous preferences; v2 wins',()=>{
 const values=new Map<string,string>([['somnia.look.v1',JSON.stringify({accent:'#ABCD12',background:'glass',uiScale:115})]]);
 const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)}});
 try{
  const migrated=readLook();assert.equal(migrated.accent,'#abcd12');assert.equal(migrated.uiScale,115);assert.equal(migrated.glassBlur,24);assert.equal(migrated.outerRadius,25);
  rememberLook({...migrated,glassBlur:12,glassPanels:false,outerRadius:0});
  assert.equal(JSON.parse(values.get(LOOK_KEY)!).version,2);
  assert.equal(readLook().glassBlur,12);assert.equal(readLook().outerRadius,0);assert.equal(readLook().glassPanels,false);
  rememberLook({...DEFAULT_LOOK});assert.deepEqual(readLook(),DEFAULT_LOOK);
  assert.equal(JSON.parse(values.get('somnia.look.v1')!).background,'glass');
  values.set(LOOK_KEY,'bad json');assert.deepEqual(readLook(),DEFAULT_LOOK);
  values.set(LOOK_KEY,JSON.stringify({version:3,look:{outerRadius:2}}));assert.deepEqual(readLook(),DEFAULT_LOOK);
  values.delete(LOOK_KEY);values.set('somnia.look.v1','null');assert.deepEqual(readLook(),DEFAULT_LOOK);
 }finally{if(original)Object.defineProperty(globalThis,'localStorage',original);else Reflect.deleteProperty(globalThis,'localStorage');}
});

test('CSS live apply sets only outer token and preserves popup/control tokens',()=>{
 const values=new Map<string,string>([['--r-panel','25px'],['--r-control','16px']]);
 const root={style:{setProperty:(k:string,v:string)=>values.set(k,v),removeProperty:(k:string)=>values.delete(k)},dataset:{}} as unknown as HTMLElement;
 applyLook({...DEFAULT_LOOK,glassBlur:8,glassPanels:false,outerRadius:0},root);
 assert.equal(values.get('--glass-blur'),'8px');assert.equal(values.get('--r-outer'),'0px');assert.equal(root.dataset.glassPanels,'false');assert.equal(values.get('--r-panel'),'25px');assert.equal(values.get('--r-control'),'16px');
 applyLook(DEFAULT_LOOK,root);assert.equal(values.get('--r-outer'),'25px');assert.equal(values.get('--glass-blur'),'24px');assert.equal(root.dataset.glassPanels,'true');
});

test('storage unavailable is safe',()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('denied');}});
 try{assert.deepEqual(readLook(),DEFAULT_LOOK);assert.doesNotThrow(()=>rememberLook(DEFAULT_LOOK));}finally{if(original)Object.defineProperty(globalThis,'localStorage',original);else Reflect.deleteProperty(globalThis,'localStorage');}
});
