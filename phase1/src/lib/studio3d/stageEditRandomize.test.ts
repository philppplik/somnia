import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage,StageError} from './stage';
import {randomizeSelected,EditError,type MeshData} from './editMesh';

test('stage editRandomize: seeded jitter is reproducible, bounded and undoable',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 const before=[...o.geometry.getAttribute('position').array] as number[];
 st.editStart(o.id);
 st.editSelect('vertex',[0,1,2,3]);
 st.editRandomize(0.25,42);
 const pos=[...o.geometry.getAttribute('position').array] as number[];
 let moved=0;
 for(let i=0;i<pos.length;i++){const d=Math.abs(pos[i]-before[i]);assert.ok(d<=0.25+1e-6,'displacement bounded by the amount');if(d>1e-9)moved++;}
 assert.ok(moved>0,'something actually moved');
 assert.deepEqual(st.editSelection().verts,[0,1,2,3],'selection kept');
 st.undo();
 assert.deepEqual([...o.geometry.getAttribute('position').array],before,'undo restores exact positions');
 st.redo();
 assert.deepEqual([...o.geometry.getAttribute('position').array],pos,'redo reproduces the seeded jitter exactly');
 st.undo();
 st.editRandomize(0.25,42);
 const again=[...o.geometry.getAttribute('position').array] as number[];
 assert.deepEqual(again,pos,'same mesh and same seed give the same result');
 st.undo();
 st.editRandomize(0.25,43);
 const other=[...o.geometry.getAttribute('position').array] as number[];
 assert.notDeepEqual(other,pos,'a different seed jitters differently');
});

test('stage editRandomize: guards refuse empty selections and bad parameters',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube');
 st.editStart(o.id);
 assert.throws(()=>st.editRandomize(0.1,1),/Select vertices to randomize/);
 st.editSelect('vertex',[0]);
 assert.throws(()=>st.editRandomize(0,1),/non-zero number/);
 assert.throws(()=>st.editRandomize(0.1,0),/seed must be a whole number/);
 st.editEnd();
 assert.throws(()=>st.editRandomize(0.1,1),StageError);
});

test('randomizeSelected glues position-equal twins and damps through masks',()=>{
 const m:MeshData={positions:[0,0,0, 2,0,0, 2,0,0, 0,2,0],index:[0,1,3, 1,2,3],uvs:[0,0, 1,0, 1,0.5, 0,1],mask:[0,0,0.5,1]};
 const r=randomizeSelected(m,[0,1,2],0.5,7);
 assert.deepEqual([r.positions[3],r.positions[4],r.positions[5]],[r.positions[6],r.positions[7],r.positions[8]],'twins get the identical displacement');
 assert.deepEqual([r.positions[3],r.positions[4],r.positions[5]].some((x,i)=>Math.abs(x-[2,0,0][i])>1e-9),true,'the unmasked twin pulls the seam at full strength');
 const r2=randomizeSelected({...m,mask:[0.5,0.5,0.5,1]},[0,1,2],0.5,7);
 const half=Math.hypot(r2.positions[0],r2.positions[1],r2.positions[2]);
 const full=Math.hypot(r.positions[0],r.positions[1],r.positions[2]);
 assert.ok(Math.abs(half-full/2)<1e-6,'mask 0.5 on every twin damps the seam to half');
 assert.deepEqual(r.positions.slice(9,12),[0,2,0],'fully masked vertex 3 does not move');
 assert.equal(r.mask!.length,4,'mask carried');
 assert.throws(()=>randomizeSelected(m,[9],0.1,1),/Vertex 9 does not exist/);
 assert.throws(()=>randomizeSelected(m,[],0.1,1),EditError);
});
