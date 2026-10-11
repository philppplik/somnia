import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_INTAKE_POLICY,getIntakePolicy,readIntakePolicy,sanitizeIntakePolicy,setIntakePolicy,syncIntakePolicyToNative} from './intakePolicy';

function memStorage(initial:Record<string,string>={}){
 const map=new Map(Object.entries(initial));
 return{getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v);},map};
}

test('default denies UNC and garbage never flips it on',()=>{
 assert.deepEqual(readIntakePolicy(memStorage()),DEFAULT_INTAKE_POLICY);
 assert.equal(readIntakePolicy(memStorage()).allowUnc,false);
 assert.equal(sanitizeIntakePolicy({allowUnc:'yes'}).allowUnc,false);
 assert.equal(sanitizeIntakePolicy({allowUnc:true}).allowUnc,true);
 assert.equal(sanitizeIntakePolicy(null).allowUnc,false);
 assert.equal(readIntakePolicy(memStorage({'somnia.intakePolicy.v1':'{broken json'})).allowUnc,false);
});

test('set with a native client syncs the host FIRST and persists only after acceptance',async()=>{
 const storage=memStorage();const order:string[]=[];
 const client={async setIntakePolicy(p:{allowUnc:boolean}){order.push(`native:${p.allowUnc}`);}};
 await setIntakePolicy({allowUnc:true},client,storage);
 order.push(`persisted:${getIntakePolicy(storage).allowUnc}`);
 assert.deepEqual(order,['native:true','persisted:true']);
});

test('a native failure rejects and leaves the old setting untouched',async()=>{
 const storage=memStorage();
 const client={async setIntakePolicy(){throw new Error('ipc down');}};
 await assert.rejects(()=>setIntakePolicy({allowUnc:true},client,storage));
 assert.equal(getIntakePolicy(storage).allowUnc,false);
});

test('without a client (web build) the value persists locally only',async()=>{
 const storage=memStorage();
 await setIntakePolicy({allowUnc:true},null,storage);
 assert.equal(getIntakePolicy(storage).allowUnc,true);
});

test('boot sync pushes the persisted renderer value to the host before the first drain',async()=>{
 const storage=memStorage();
 await setIntakePolicy({allowUnc:true},null,storage);
 const pushed:boolean[]=[];
 await syncIntakePolicyToNative({async setIntakePolicy(p){pushed.push(p.allowUnc);}},storage);
 assert.deepEqual(pushed,[true]);
});
