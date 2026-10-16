import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

// Unit cube geometry: corners at (±0.5, ±0.5, ±0.5) local, 24 unwelded rows (position twins per corner).
const cornerRows=(o:import('three').Mesh,x:number,y:number,z:number):number[]=>{
 const g=o.geometry.getAttribute('position');const out:number[]=[];
 for(let i=0;i<g.count;i++)if(Math.abs(g.getX(i)-x)<1e-6&&Math.abs(g.getY(i)-y)<1e-6&&Math.abs(g.getZ(i)-z)<1e-6)out.push(i);
 return out;
};
const at=(o:import('three').Mesh,i:number):[number,number,number]=>{
 const g=o.geometry.getAttribute('position');return[g.getX(i),g.getY(i),g.getZ(i)];
};
const near=(p:[number,number,number],x:number,y:number,z:number)=>Math.abs(p[0]-x)<1e-6&&Math.abs(p[1]-y)<1e-6&&Math.abs(p[2]-z)<1e-6;
const hasRow=(o:import('three').Mesh,x:number,y:number,z:number)=>cornerRows(o,x,y,z).length>0;

test('stage edit mirror: move carries the mirrored corner the opposite way, one undo for both',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(a.id);
 st.editSelect('vertex',[cornerRows(a,0.5,0.5,0.5)[0]]);
 st.setEditMirror('x');
 st.editMove([0.1,0,0]);
 assert.ok(hasRow(a,0.6,0.5,0.5),'primary corner moved +x');
 assert.ok(hasRow(a,-0.6,0.5,0.5),'mirrored corner moved -x');
 assert.ok(!hasRow(a,0.5,0.5,0.5)&&!hasRow(a,-0.5,0.5,0.5),'both corners left their rest spots');
 st.undo();
 assert.ok(hasRow(a,0.5,0.5,0.5)&&hasRow(a,-0.5,0.5,0.5),'one undo restores both sides');
 st.redo();
 assert.ok(hasRow(a,0.6,0.5,0.5)&&hasRow(a,-0.6,0.5,0.5),'redo restores the mirrored move');
});

test('stage edit mirror: without a counterpart row nothing else moves',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(a.id);
 st.editSelect('vertex',[cornerRows(a,0.5,0.5,0.5)[0]]);
 st.editMove([0.1,0,0]); // breaks symmetry: corner now at (0.6,0.5,0.5), no row at (-0.6,0.5,0.5)
 st.setEditMirror('x');
 st.editMove([0.1,0,0]);
 assert.ok(hasRow(a,0.7,0.5,0.5),'primary corner moved on');
 assert.ok(hasRow(a,-0.5,0.5,0.5),'the far corner stayed put (no counterpart at -0.6)');
 assert.ok(!hasRow(a,-0.7,0.5,0.5)&&!hasRow(a,-0.6,0.5,0.5),'nothing mirrored into empty space');
});

test('stage edit mirror: rotate keeps the mesh symmetric (mirrored side rotates back)',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(a.id);
 st.editSelect('vertex',[...cornerRows(a,0.5,0.5,0.5),...cornerRows(a,0.5,-0.5,-0.5)]);
 st.setEditMirror('x');
 st.editRotate('y',30);
 // symmetry assertion: every row's mirrored position must also exist
 const g=a.geometry.getAttribute('position');
 for(let i=0;i<g.count;i++){
  assert.ok(hasRow(a,-g.getX(i),g.getY(i),g.getZ(i)),`row ${i} at ${g.getX(i)},${g.getY(i)},${g.getZ(i)} has its mirror`);
 }
 // and the selected corners actually left their rest spots
 assert.ok(!hasRow(a,0.5,0.5,0.5),'primary corner rotated away');
 assert.ok(!hasRow(a,-0.5,0.5,0.5),'mirrored corner rotated too');
});

test('stage edit mirror: scale mirrors about the mirrored centroid',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(a.id);
 st.editSelect('vertex',[...cornerRows(a,0.5,0.5,0.5),...cornerRows(a,0.5,0.5,-0.5)]);
 st.setEditMirror('x');
 st.editScale([1,1,2]);
 assert.ok(hasRow(a,0.5,0.5,1)&&hasRow(a,0.5,0.5,-1),'primary side scaled apart');
 assert.ok(hasRow(a,-0.5,0.5,1)&&hasRow(a,-0.5,0.5,-1),'mirrored side scaled the same way');
});

test('stage edit mirror: shear negates the factor across the mirror axis',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(a.id);
 st.editSelect('vertex',[...cornerRows(a,0.5,0.5,0.5),...cornerRows(a,0.5,0.5,-0.5)]);
 st.setEditMirror('x');
 st.editShear('x','z',0.5); // shear pivots on the selection centroid (z=0): x += 0.5*z
 assert.ok(hasRow(a,0.75,0.5,0.5)&&hasRow(a,0.25,0.5,-0.5),'primary side sheared +x by z');
 assert.ok(hasRow(a,-0.75,0.5,0.5)&&hasRow(a,-0.25,0.5,-0.5),'mirrored side sheared the opposite way');
});

test('stage edit mirror: off by default, moves stay one-sided',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(a.id);
 st.editSelect('vertex',[cornerRows(a,0.5,0.5,0.5)[0]]);
 st.editMove([0.1,0,0]);
 assert.ok(hasRow(a,0.6,0.5,0.5)&&hasRow(a,-0.5,0.5,0.5),'only the selected corner moved');
});
