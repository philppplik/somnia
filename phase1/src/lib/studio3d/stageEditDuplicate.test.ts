import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage,StageError} from './stage';
import {duplicateFaces,EditError,type MeshData} from './editMesh';

test('stage editDuplicate: one cube side doubles as a detached shell, undo restores geometry exactly',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 const g=o.geometry;
 st.editStart(o.id);
 st.editSelect('face',[4,5]);
 st.editDuplicate();
 assert.equal(o.geometry.getIndex()!.count/3,14,'two triangles copied');
 assert.equal(o.geometry.getAttribute('position').count,28,'four fresh vertex copies (the pair shares its diagonal)');
 assert.notEqual(o.geometry,g,'geometry swapped');
 assert.deepEqual(st.editSelection(),{verts:[24,25,26,27],edges:[],faces:[12,13]},'selection stays on the fresh island (grab mode)');
 st.undo();
 assert.equal(o.geometry,g,'undo restores the original geometry object');
 assert.equal(o.geometry.getIndex()!.count/3,12);
 st.redo();
 assert.equal(o.geometry.getIndex()!.count/3,14);
});

test('stage editDuplicate: guards refuse empty selections and unknown ids',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube');
 st.editStart(o.id);
 assert.throws(()=>st.editDuplicate(),/Select faces to duplicate/);
 assert.throws(()=>st.editSelect('face',[99]),/does not exist/,'selection itself validates ids');
 st.editEnd();
 assert.throws(()=>st.editDuplicate(),StageError);
});

test('duplicateFaces copies with fresh shared vertices, keeps UVs and drops masks',()=>{
 const m:MeshData={positions:[0,0,0, 2,0,0, 0,2,0, 2,2,0],index:[0,1,2, 1,3,2],uvs:[0,0, 1,0, 0,1, 1,1],mask:[1,1,1,1]};
 const r=duplicateFaces(m,[0]);
 assert.equal(r.index.length/3,3,'original two plus the copy');
 assert.equal(r.positions.length/3,7,'three fresh vertex copies');
 assert.deepEqual(r.index.slice(-3),[4,5,6],'copy appended with fresh indices');
 assert.deepEqual([r.positions[12],r.positions[13],r.positions[14]],[0,0,0],'copy matches the original position');
 assert.equal(r.uvs!.length,14,'uv rows copied with the vertices');
 assert.deepEqual([r.uvs![10],r.uvs![11]],[1,0],'uv copy matches');
 assert.equal(r.mask,undefined,'mask dropped by topology change');
 const both=duplicateFaces(m,[0,1]);
 assert.equal(both.positions.length/3,8,'copies share vertices where the originals share them');
 assert.equal(both.index.length/3,4);
 assert.throws(()=>duplicateFaces(m,[]),EditError);
 assert.throws(()=>duplicateFaces(m,[2]),EditError);
 assert.throws(()=>duplicateFaces(m,[-1]),EditError);
});

test('stage editDuplicate grab: the first move separates the island, the original stays put',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelectAll('all','face');
 st.editDuplicate();
 const before=[...(o.geometry.getAttribute('position').array as Float32Array)];
 assert.equal(st.editSelection().verts.length,24,'island rows selected');
 st.editMove([0,0.5,0]);
 const g=o.geometry.getAttribute('position');
 for(let v=0;v<24;v++)assert.ok(Math.abs(g.getY(v)-before[v*3+1])<1e-6,`original row ${v} untouched`);
 for(let v=24;v<48;v++)assert.ok(Math.abs(g.getY(v)-(before[v*3+1]+0.5))<1e-6,`island row ${v} moved fully`);
});

test('stage editDuplicate grab: proportional editing does not leak onto the coincident original',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelectAll('all','face');
 st.editDuplicate();
 const before=[...(o.geometry.getAttribute('position').array as Float32Array)];
 st.editMove([0.4,0,0],{radius:10,falloff:'constant'});
 const g=o.geometry.getAttribute('position');
 for(let v=0;v<24;v++)assert.ok(Math.abs(g.getX(v)-before[v*3])<1e-6,`original row ${v} not pulled proportionally`);
 for(let v=24;v<48;v++)assert.ok(Math.abs(g.getX(v)-(before[v*3]+0.4))<1e-6,`island row ${v} moved fully`);
 // The grab is sticky until reselection: the next move still addresses the island rows directly.
 st.editMove([0.1,0,0]);
 const g2=o.geometry.getAttribute('position');
 for(let v=24;v<48;v++)assert.ok(Math.abs(g2.getX(v)-(before[v*3]+0.5))<1e-6,`second move follows island row ${v} normally`);
});

test('stage editDuplicate grab: undo and reselection disarm the grab',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelectAll('all','face');
 st.editDuplicate();
 st.undo();
 assert.equal(o.geometry.getAttribute('position').count,24,'island gone after undo');
 st.editSelectAll('all','vertex');
 const beforeY=[...(o.geometry.getAttribute('position').array as Float32Array)];
 st.editMove([0,0.25,0]);
 const g=o.geometry.getAttribute('position');
 for(let v=0;v<24;v++)assert.ok(Math.abs(g.getY(v)-(beforeY[v*3+1]+0.25))<1e-6,`normal welded move after undo, row ${v}`);
 st.editSelectAll('all','face');
 st.editDuplicate();
 st.editSelectAll('none','face');
 st.editSelectAll('all','vertex');
 const beforeX=[...(o.geometry.getAttribute('position').array as Float32Array)];
 st.editMove([0.2,0,0]);
 const g3=o.geometry.getAttribute('position');
 for(let v=0;v<24;v++)assert.ok(Math.abs(g3.getX(v)-(beforeX[v*3]+0.2))<1e-6,`reselection disarmed the index grab, original row ${v} moved normally`);
});

test('stage editDuplicate grab: repeated nudges never re-weld when the island crosses the original',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelectAll('all','face');
 st.editDuplicate();
 for(let i=0;i<6;i++)st.editMove([0,0.25,0]);
 const g=o.geometry.getAttribute('position');
 let orig=0,isl=0;
 for(let v=0;v<24;v++)orig+=g.getY(v);
 for(let v=24;v<48;v++)isl+=g.getY(v);
 assert.ok(Math.abs(orig/24)<1e-6,`original centroid stays at 0, got ${orig/24}`);
 assert.ok(Math.abs(isl/24-1.5)<1e-6,`island centroid at 1.5, got ${isl/24}`);
});
