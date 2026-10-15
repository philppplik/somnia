import test from 'node:test';import assert from 'node:assert/strict';
import {readdirSync} from 'node:fs';
import {createDocument,findComp,validateDocument} from './model';
import {applyEdits} from './edit';
import {frameToTick} from './time';
import {AnimationSession,setAnimationSession} from './session';
/** Sweep: every layer command with its menu-style arguments leaves a valid document and is exactly one undo step. */
const f=(n:number)=>frameToTick(n,{num:30,den:1});
const doc=()=>applyEdits(createDocument(),[
 {type:'layer.add',kind:'shape',id:'a'},{type:'prop.animate',layer:'a',prop:'position',on:true,t:f(0)},{type:'prop.set',layer:'a',prop:'position',t:f(0),value:[100,100]},{type:'prop.set',layer:'a',prop:'position',t:f(10),value:[200,50]},
 {type:'layer.add',kind:'text',id:'t'},{type:'layer.update',layer:'t',source:{text:'{n} items',size:40}},
 {type:'layer.add',kind:'solid',id:'c'},{type:'layer.update',layer:'c',source:{color:'#ff0000',gradient:{start:'#ff0000',end:'#0000ff',angle:0}}},
 {type:'layer.effects',layer:'c',effects:[{id:'e1',kind:'glow',enabled:true,amount:0.5,color:'#ff0000'}]},
 {type:'layer.add',kind:'shape',id:'d'}] as never);
const ARGS:Record<string,object[]>={
 'animation.layers.wipe':[{mode:'in',dir:'left'},{mode:'out',dir:'down',frames:5}],'animation.layers.slide':[{mode:'in',dir:'right'},{mode:'out',dir:'up',ease:false}],
 'animation.layers.flicker':[{frames:12},{frames:36,seed:9}],'animation.layers.shake':[{amount:6},{amount:20,frames:30}],
 'animation.text.count':[{from:0,to:100},{from:0,to:10000,grouping:true},{remove:true}],'animation.layers.spin':[{turns:2},{turns:-1,ease:true}],
 'animation.layers.wave':[{kind:'bob'},{kind:'swing'},{kind:'breathe'}],'animation.layers.pulseGlow':[{cycles:2},{cycles:6}],
 'animation.layers.fade':[{mode:'both'}],'animation.layers.stepMotion':[{n:2},{n:4}],'animation.palette.shift':[{hue:90},{lightness:-10}],
};
test('P283 sweep: new layer commands leave a valid document and are one undo step',async()=>{
 const dir=new URL('.',import.meta.url).pathname,bad:string[]=[];let ran=0;
 for(const file of readdirSync(dir).filter(n=>/(Commands)\.ts$/.test(n))){
  const mod=await import('./'+file.replace(/\.ts$/,''));
  for(const [name,fn] of Object.entries(mod)){
   if(!/Specs$/.test(name)||typeof fn!=='function')continue;
   let specs:{id:string;run:(p?:unknown)=>unknown}[];try{specs=(fn as ()=>never)();}catch{continue;}
   for(const spec of specs){
    if(/^animation\.(export|template|render|precomp|comp)\./.test(spec.id))continue;
    for(const args of ARGS[spec.id]??[{}]){
     const s=new AnimationSession();s.open(doc());setAnimationSession(s);
     const before=JSON.stringify(s.document),ids=findComp(s.document!)!.layers.map(l=>l.id);
     try{await spec.run({...args,layers:ids});}catch(e){if((e as {expected?:boolean}).expected||(e as Error).name==='EditError')continue;bad.push(`${spec.id} ${JSON.stringify(args)}: ${(e as Error).message}`);continue;}
     if(JSON.stringify(s.document)===before)continue;
     ran++;
     const errs=validateDocument(s.document);if(errs.length)bad.push(`${spec.id} ${JSON.stringify(args)}: invalid ${errs[0]}`);
     if(s.getState().canUndo){s.undo();if(JSON.stringify(s.document)!==before)bad.push(`${spec.id} ${JSON.stringify(args)}: undo does not restore`);}
    }
   }
  }
 }
 console.log('sweep ran',ran);assert.deepEqual(bad,[]);assert.ok(ran>20);
});
