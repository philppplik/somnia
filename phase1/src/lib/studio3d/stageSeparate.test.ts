import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';
import {separateMesh} from './editMesh';

const quad=(ox:number)=>({positions:[ox,0,0, ox+1,0,0, ox+1,1,0, ox,1,0],index:[0,1,2, 0,2,3],uvs:[0,0, 1,0, 1,1, 0,1]});

test('separateMesh splits loose parts, largest first, carrying UVs',()=>{
 const a=quad(0),b=quad(5);
 const m={positions:[...a.positions,...b.positions],index:[...a.index,...b.index.map(i=>i+4)],uvs:[...a.uvs,...b.uvs]};
 const parts=separateMesh(m);
 assert.equal(parts.length,2);
 assert.equal(parts[0].positions.length/3,4);
 assert.deepEqual(parts[0].uvs,a.uvs);
 assert.equal(parts[1].positions.length/3,4);
});

test('separateMesh keeps UV-seam twins and touching faces in one part',()=>{
 // Two triangles sharing an edge only by position (split vertices, like a UV seam).
 const m={positions:[0,0,0, 1,0,0, 1,1,0, 0,0,0, 1,1,0, 0,1,0],index:[0,1,2, 3,4,5]};
 assert.equal(separateMesh(m).length,1);
 // Truly loose triangles separate.
 const n={positions:[...m.positions.map((v,i)=>i%3===0?v+10:v),...m.positions],index:[...m.index,...m.index.map(i=>i+6)]};
 assert.equal(separateMesh(n).length,2);
});

test('stage separate splits a merged pair into siblings and undo rejoins them',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube');a.position.x=0;
 const b=st.addPrimitive('cube');b.position.x=3;
 const merged=st.merge([a.id,b.id]);
 assert.equal(merged.geometry.getAttribute('position').count,72,'merge stores non-indexed geometry');
 const before=st.root.children.length;
 const made=st.separate([merged.id]);
 assert.equal(made,2);
 assert.equal(st.root.children.length,before+1);
 const part2=st.root.children[st.root.children.length-1] as typeof merged;
 assert.equal(part2.name,'Merged.2');
 assert.equal(part2.position.x,merged.position.x,'sibling keeps the transform');
 assert.notEqual((part2.material as {uuid:string}).uuid,(merged.material as {uuid:string}).uuid,'material cloned');
 const c1=merged.geometry.getAttribute('position').count,c2=part2.geometry.getAttribute('position').count;
 assert.equal(c1+c2,72);
 assert.ok(merged.geometry.getAttribute('uv')&&part2.geometry.getAttribute('uv'),'UVs carried');
 st.undo();
 assert.equal(st.root.children.length,before);
 assert.equal(merged.geometry.getAttribute('position').count,72,'merge stores non-indexed geometry');
 st.redo();
 assert.equal(st.root.children.length,before+1);
});

test('stage separate refuses a single connected mesh and skips it in a batch',()=>{
 const st=new Stage();
 const c=st.addPrimitive('cube');
 assert.throws(()=>st.separate([c.id]),/one connected part/);
 const a=st.addPrimitive('cube');a.position.x=0;
 const b=st.addPrimitive('cube');b.position.x=3;
 const merged=st.merge([a.id,b.id]);
 assert.equal(st.separate([merged.id,c.id]),2,'single-part cube is skipped, pair splits');
});

test('stage separate treats exactly touching cubes as one part',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube');a.position.x=0;
 const b=st.addPrimitive('cube');b.position.x=1; // faces share a plane, corners touch by position
 const merged=st.merge([a.id,b.id]);
 assert.throws(()=>st.separate([merged.id]),/one connected part/);
});
