import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

const closed=(o:import('three').Mesh)=>{
 const g=o.geometry,p=g.getAttribute('position');
 const pk=(v:number)=>`${Math.round(p.getX(v)*1e6)},${Math.round(p.getY(v)*1e6)},${Math.round(p.getZ(v)*1e6)}`;
 const use=new Map<string,number>();
 const idx=g.getIndex()!.array;
 for(let f=0;f<idx.length;f+=3)for(let e=0;e<3;e++){
  const ka=pk(idx[f+e]),kb=pk(idx[f+(e+1)%3]);
  const k=ka<kb?ka+'|'+kb:kb+'|'+ka;
  use.set(k,(use.get(k)||0)+1);
 }
 return [...use.values()].every(n=>n===2);
};

test('stage editSymmetrize: mirrors the kept side onto a deleted cap and closes the mesh, undo restores',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('face',[2,3]); // -X cap
 st.editDelete('face');
 assert.equal(o.geometry.getIndex()!.array.length/3,10);
 st.editSymmetrize('x','positive',0.0001);
 assert.ok(closed(o));
 const p=o.geometry.getAttribute('position');
 let minX=Infinity;
 for(let v=0;v<p.count;v++)minX=Math.min(minX,p.getX(v));
 assert.ok(Math.abs(minX+0.5)<1e-6);
 st.undo();
 assert.equal(o.geometry.getIndex()!.array.length/3,10);
});

test('stage editSymmetrize: negative side wipes a dented positive side',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('vertex',[8]);
 st.editVertSlide([8,10],0.5);
 st.editSymmetrize('x','negative',0.0001);
 assert.ok(closed(o));
 const p=o.geometry.getAttribute('position');
 let maxX=-Infinity;
 for(let v=0;v<p.count;v++)maxX=Math.max(maxX,p.getX(v));
 assert.ok(Math.abs(maxX-0.5)<1e-6);
});
