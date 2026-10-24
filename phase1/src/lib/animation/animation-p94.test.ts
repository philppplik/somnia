import test from 'node:test';import assert from 'node:assert/strict';
import {createDocument,findComp,findLayer} from './model';
import {applyEdits,type Edit} from './edit';
import {worldMatrix} from './scene';
import {chainEdits,groupEdits,releaseEdits,RigError,MAX_RIG_LAYERS} from './rig';
const mk=(n:number)=>{const e:Edit[]=[];for(let i=0;i<n;i++)e.push({type:'layer.add',kind:'shape',id:`l${i}`},{type:'prop.set',layer:`l${i}`,prop:'position',t:0,value:[100+i*50,200-i*10]});return applyEdits(createDocument(),e);};
const comp=(d:ReturnType<typeof mk>)=>findComp(d)!;
const pos=(d:ReturnType<typeof mk>,id:string)=>{const c=comp(d);return worldMatrix(c,findLayer(c,id)!,0).slice(4);};
test('chain parents in order and keeps every world pose',()=>{
  const d=mk(3),c=comp(d),before=['l0','l1','l2'].map(i=>pos(d,i));
  const n=applyEdits(d,chainEdits(c,['l2','l0','l1'],0)),cn=comp(n);
  assert.equal(findLayer(cn,'l2')!.parent,null);assert.equal(findLayer(cn,'l0')!.parent,'l2');assert.equal(findLayer(cn,'l1')!.parent,'l0');
  ['l0','l1','l2'].forEach((id,i)=>{const a=pos(n,id);assert.ok(Math.abs(a[0]-before[i][0])<1e-6&&Math.abs(a[1]-before[i][1])<1e-6,id);});
});
test('group adds a null and parents every picked layer to it',()=>{
  const d=mk(2),n=applyEdits(d,groupEdits(comp(d),['l0','l1'],'rig1',0)),c=comp(n);
  assert.equal(findLayer(c,'rig1')!.kind,'null');assert.equal(findLayer(c,'rig1')!.name,'Rig');
  assert.equal(findLayer(c,'l0')!.parent,'rig1');assert.equal(findLayer(c,'l1')!.parent,'rig1');
  assert.deepEqual(pos(n,'l1'),pos(d,'l1'));
});
test('release removes parents and keeps the pose; nothing to release is an error',()=>{
  const d=mk(2),g=applyEdits(d,groupEdits(comp(d),['l0','l1'],'rig1',0)),r=applyEdits(g,releaseEdits(comp(g),['l0','l1'],0));
  assert.equal(findLayer(comp(r),'l0')!.parent,null);assert.deepEqual(pos(r,'l0'),pos(d,'l0'));
  assert.throws(()=>releaseEdits(comp(d),['l0'],0),RigError);
});
test('picks are validated',()=>{
  const d=mk(2),c=comp(d);
  assert.throws(()=>chainEdits(c,['l0'],0),RigError);assert.throws(()=>chainEdits(c,['l0','nope'],0),RigError);
  assert.throws(()=>groupEdits(c,[],'x',0),RigError);
  assert.throws(()=>groupEdits(c,Array.from({length:MAX_RIG_LAYERS+1},(_,i)=>`a${i}`),'x',0),RigError);
  assert.equal(chainEdits(c,['l0','l0','l1'],0).length,1);
  const locked=applyEdits(d,[{type:'layer.update',layer:'l1',locked:true}]);assert.throws(()=>chainEdits(comp(locked),['l0','l1'],0),RigError);
});
test('a chain that would make a cycle fails as a whole',()=>{
  const d=mk(2),once=applyEdits(d,chainEdits(comp(d),['l0','l1'],0));
  assert.throws(()=>applyEdits(once,chainEdits(comp(once),['l1','l0'],0)));
});
