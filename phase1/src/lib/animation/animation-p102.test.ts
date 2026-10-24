import test from 'node:test';import assert from 'node:assert/strict';
import {createDocument,findComp,findLayer} from './model';
import {applyEdits,styleLaneKeys,EditError} from './edit';
import {frameToTick} from './time';
import {copySetKeys,pasteSetEdits,pastedStyleRefs} from './keySetClip';
import {styleKeyLanes} from './keyLanes';
const f=(n:number)=>frameToTick(n,{num:30,den:1});
const colorLayer=(id:string,colors:[number,string][])=>[{type:'layer.add',kind:'shape',id},{type:'color.prop',layer:id,prop:'fill',op:'animate',on:true,t:f(colors[0][0])},...colors.map(([t,c])=>({type:'color.prop',layer:id,prop:'fill',op:'set',color:c,t:f(t)}))];
const doc=()=>applyEdits(createDocument(),[...colorLayer('a',[[10,'#ff0000'],[40,'#00ff00']]),...colorLayer('b',[[0,'#0000ff'],[5,'#111111']]),{type:'layer.add',kind:'shape',id:'n'}] as never);
const fill=(d:ReturnType<typeof doc>,id:string)=>(findLayer(findComp(d)!,id)!.colorKeys?.fill??[]).map(k=>[k.t,k.color]);
const rd=(d:ReturnType<typeof doc>)=>(layer:string,lane:Parameters<typeof styleLaneKeys>[2])=>styleLaneKeys(d,layer,lane);
test('style keys are copied with relative time and pasted into the same lane of another layer',()=>{
  const d=doc(),c=findComp(d)!;
  const k=copySetKeys(c,[],[{layer:'a',lane:'fill',t:f(10)},{layer:'a',lane:'fill',t:f(40)}],rd(d));
  assert.equal(k.first,f(10));assert.deepEqual(k.groups[0].style.map(x=>x.dt),[0,f(30)]);
  const n=applyEdits(d,pasteSetEdits(c,k,f(100),['b']));
  assert.deepEqual(fill(n,'b'),[[0,'#0000ff'],[f(5),'#111111'],[f(100),'#ff0000'],[f(130),'#00ff00']]);
});
test('transform and style keys travel together and keep their relative times',()=>{
  const d=applyEdits(doc(),[{type:'prop.animate',layer:'a',prop:'position',on:true,t:f(20)}] as never),c=findComp(d)!;
  const k=copySetKeys(c,[{layer:'a',prop:'position',t:f(20)}],[{layer:'a',lane:'fill',t:f(40)}],rd(d));
  assert.equal(k.first,f(20));assert.equal(k.groups[0].items[0].dt,0);assert.equal(k.groups[0].style[0].dt,f(20));
  const e=pasteSetEdits(c,k,f(60),['a']);assert.equal(e.length,2);
  const n=applyEdits(d,e);assert.equal(findLayer(findComp(n)!,'a')!.transform.position.keys.some(x=>x.t===f(60)),true);assert.equal(fill(n,'a').some(x=>x[0]===f(80)),true);
  assert.deepEqual(pastedStyleRefs(c,k,f(60),['a']),[{layer:'a',lane:'fill',t:f(80)}]);
});
test('a target without that animated lane refuses the whole paste; locked and out-of-range too',()=>{
  const d=doc(),c=findComp(d)!,k=copySetKeys(c,[],[{layer:'a',lane:'fill',t:f(10)}],rd(d));
  assert.throws(()=>applyEdits(d,pasteSetEdits(c,k,f(5),['n'])),EditError);
  assert.throws(()=>applyEdits(d,pasteSetEdits(c,k,c.start+c.duration+f(10),['b'])),EditError);
  const locked=applyEdits(d,[{type:'layer.update',layer:'b',locked:true}] as never);assert.throws(()=>applyEdits(locked,pasteSetEdits(c,k,f(5),['b'])),EditError);
  assert.throws(()=>copySetKeys(c,[],[{layer:'a',lane:'fill',t:f(11)}],rd(d)));
});
test('style lane reader returns keys of existing lanes only and lanes list matches',()=>{
  const d=doc();assert.equal(styleLaneKeys(d,'a','fill').length,2);assert.equal(styleLaneKeys(d,'n','fill').length,0);assert.equal(styleLaneKeys(d,'a','strokeWidth').length,0);
  assert.deepEqual(styleKeyLanes(findLayer(findComp(d)!,'a')!).map(x=>x.id),['fill']);
});
