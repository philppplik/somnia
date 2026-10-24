import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

const pos=(o:import('three').Mesh,v:number)=>{const p=o.geometry.getAttribute('position');return [p.getX(v),p.getY(v),p.getZ(v)];};

test('stage editVertSlide: slides a vertex to the far endpoint at factor 1, undo restores',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 const target=pos(o,10);
 st.editSelect('vertex',[8]);
 st.editVertSlide([8,10],1);
 assert.deepEqual(pos(o,8),target);
 st.undo();
 assert.notDeepEqual(pos(o,8),target);
 st.redo();
 assert.deepEqual(pos(o,8),target);
});

test('stage editVertSlide: halfway at factor 0.5 and position-equal twins move together',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 const a=pos(o,8),b=pos(o,10);
 const twins:number[]=[];
 const p=o.geometry.getAttribute('position');
 for(let v=0;v<p.count;v++)if(v!==8&&pos(o,v).every((x,i)=>Math.abs(x-a[i])<1e-6))twins.push(v);
 assert.ok(twins.length>0);
 st.editSelect('vertex',[8]);
 st.editVertSlide([8,10],0.5);
 const mid=a.map((x,i)=>(x+b[i])/2);
 assert.ok(pos(o,8).every((x,i)=>Math.abs(x-mid[i])<1e-6));
 for(const t of twins)assert.ok(pos(o,t).every((x,i)=>Math.abs(x-mid[i])<1e-6));
});

test('stage editVertSlide: guards the vertex, the edge and the factor',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 assert.throws(()=>st.editVertSlide([8,10],0.5),/Select exactly one vertex to slide/);
 st.editSelect('vertex',[8,9]);
 assert.throws(()=>st.editVertSlide([8,10],0.5),/Select exactly one vertex to slide/);
 st.editSelectAll('none','vertex');
 st.editSelect('vertex',[8]);
 assert.throws(()=>st.editVertSlide([10,11],0.5),/The slide edge must touch the selected vertex/);
 assert.throws(()=>st.editVertSlide([8,11],0.5),/The slide edge does not exist/);
 assert.throws(()=>st.editVertSlide([8,10],2),/The slide factor must be between -1 and 1/);
});
