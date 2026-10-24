import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

const openEdges=(o:import('three').Mesh):number=>{
 const pos=o.geometry.getAttribute('position'),idx=o.geometry.getIndex()!.array;
 const pk=(v:number)=>`${Math.round(pos.getX(v)*1e6)},${Math.round(pos.getY(v)*1e6)},${Math.round(pos.getZ(v)*1e6)}`;
 const use=new Map<string,number>();
 for(let f=0;f<idx.length/3;f++)for(let e=0;e<3;e++){
  const a=pk(idx[f*3+e]),b=pk(idx[f*3+(e+1)%3]);if(a===b)continue;
  const k=a<b?a+'|'+b:b+'|'+a;use.set(k,(use.get(k)??0)+1);
 }
 let bad=0;for(const n of use.values())if(n!==2)bad++;return bad;
};

test('stage editKnife: slices all faces with a free plane, both sides stay connected, undo restores',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelectAll('all','face');
 st.editKnife(0,0,0,0,1,0);
 assert.equal(o.geometry.getIndex()!.array.length/3,28);
 assert.ok(o.geometry.getAttribute('uv'));
 assert.equal(openEdges(o),0);
 let on=0;const pos=o.geometry.getAttribute('position');
 for(let v=0;v<pos.count;v++)if(Math.abs(pos.getY(v))<1e-9)on++;
 assert.ok(on>0,'cut vertices lie on the plane');
 st.undo();
 assert.equal(o.geometry.getIndex()!.array.length/3,12);
 assert.equal(o.geometry.getAttribute('position').count,24);
});

test('stage editKnife: only the selected faces are cut',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('face',[0,1]);
 st.editKnife(0,0,0,0,1,0);
 assert.equal(o.geometry.getIndex()!.array.length/3,16);
 const pos=o.geometry.getAttribute('position');
 let cuts=0;
 for(let v=0;v<pos.count;v++)if(Math.abs(pos.getY(v))<1e-9){cuts++;assert.ok(Math.abs(pos.getX(v)-0.5)<1e-6,'every cut vertex sits on the selected +X side');}
 assert.ok(cuts>0,'the cut added vertices');
});

test('stage editKnife: a diagonal plane is not axis-aligned',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelectAll('all','face');
 st.editKnife(0,0,0,1,1,0);
 assert.equal(o.geometry.getIndex()!.array.length/3,14);
 assert.equal(openEdges(o),0);
});

test('stage editKnife: validates the selection, the normal and a plane that misses',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 assert.throws(()=>st.editKnife(0,0,0,0,1,0),/Select faces first/);
 st.editSelectAll('all','face');
 assert.throws(()=>st.editKnife(0,0,0,0,0,0),/non-zero normal/);
 assert.throws(()=>st.editKnife(0,5,0,0,1,0),/does not cut through the selected faces/);
});
