import test from 'node:test';import assert from 'node:assert/strict';import {seedFromInstaller,shouldSeed,SEEDED_KEY,type Handoff} from './installerHandoff';
const h=(o:Partial<Handoff>={}):Handoff=>({fresh_install:true,written_at:100,auto_update_check:false,...o});
const mem=()=>{const m=new Map<string,string>();return {getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v);},m};};
test('fresh install applies the installer choice once',async()=>{const s=mem();const got:boolean[]=[];
 assert.equal(await seedFromInstaller(async()=>h(),s,on=>got.push(on)),true);assert.deepEqual(got,[false]);assert.equal(s.m.get(SEEDED_KEY),'100');
 assert.equal(await seedFromInstaller(async()=>h(),s,on=>got.push(on)),false);assert.deepEqual(got,[false]);});
test('a newer installer run on a fresh install applies again',async()=>{const s=mem();s.setItem(SEEDED_KEY,'100');const got:boolean[]=[];
 assert.equal(await seedFromInstaller(async()=>h({written_at:200,auto_update_check:true}),s,on=>got.push(on)),true);assert.deepEqual(got,[true]);});
test('upgrades and non-installer starts never touch the setting',async()=>{const s=mem();const got:boolean[]=[];
 assert.equal(await seedFromInstaller(async()=>h({fresh_install:false}),s,on=>got.push(on)),false);
 assert.equal(await seedFromInstaller(async()=>null,s,on=>got.push(on)),false);assert.deepEqual(got,[]);assert.equal(shouldSeed(null,null),false);});
test('first automatic check waits for installer choice before any network request',async()=>{
 const {autoCheck,setSeedReady,setAutoCheck}=await import('./updates');
 const s=mem();const oldStorage=globalThis.localStorage;const oldFetch=globalThis.fetch;
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:s});let fetched=false;
 globalThis.fetch=(async()=>{fetched=true;throw Error('must not fetch');}) as typeof fetch;
 try{
 let finish!:()=>void;setSeedReady(new Promise<void>(r=>{finish=r;}));
 const checking=autoCheck('12.2.0');await new Promise(r=>setTimeout(r,5));assert.equal(fetched,false);
 setAutoCheck(false);finish();assert.equal(await checking,null);assert.equal(fetched,false);
 }finally{setSeedReady(Promise.resolve());globalThis.fetch=oldFetch;Object.defineProperty(globalThis,'localStorage',{configurable:true,value:oldStorage});}
});
