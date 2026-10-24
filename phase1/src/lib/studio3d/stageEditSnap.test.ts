import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

// Unit cube geometry: corners at (±0.5, ±0.5, ±0.5) local, 24 unwelded rows (position twins per corner); the object rests on the ground (world y = local y + 0.5).
const cornerRow=(o:import('three').Mesh,x:number,y:number,z:number):number=>{
 const g=o.geometry.getAttribute('position');
 for(let i=0;i<g.count;i++)if(Math.abs(g.getX(i)-x)<1e-6&&Math.abs(g.getY(i)-y)<1e-6&&Math.abs(g.getZ(i)-z)<1e-6)return i;
 throw new Error(`no row at ${x},${y},${z}`);
};
const rowAt=(o:import('three').Mesh,i:number):[number,number,number]=>{
 const g=o.geometry.getAttribute('position');return[g.getX(i),g.getY(i),g.getZ(i)];
};
const centroidY=(o:import('three').Mesh,from:number,to:number):number=>{
 const g=o.geometry.getAttribute('position');let s=0;for(let i=from;i<to;i++)s+=g.getY(i);return s/(to-from);
};

test('stage editMoveSnapped: vertex mode lands the selection exactly on another mesh vertex, one undo',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube') as import('three').Mesh;
 const b=st.addPrimitive('cube') as import('three').Mesh;
 st.setTransform(b.id,{position:{x:3}});
 st.editStart(a.id);
 const row=cornerRow(a,0.5,0.5,0.5); // world (0.5,1,0.5)
 st.editSelect('vertex',[row]);
 const applied=st.editMoveSnapped([3.05,0.05,0],'vertex',0.25); // aims just past B's corner at world (3.5,1,0.5)
 assert.ok(Math.abs(applied[0]-3)<1e-6&&Math.abs(applied[1])<1e-6&&Math.abs(applied[2])<1e-6,`snapped delta is exact, got ${applied}`);
 const p=rowAt(a,row);
 assert.ok(Math.abs(p[0]-3.5)<1e-6&&Math.abs(p[1]-0.5)<1e-6&&Math.abs(p[2]-0.5)<1e-6,`vertex sits on B corner (world 3.5,1,0.5), got ${p}`);
 st.undo();
 const q=rowAt(a,row);
 assert.ok(Math.abs(q[0]-0.5)<1e-6&&Math.abs(q[1]-0.5)<1e-6,'one undo restores the corner');
});

test('stage editMoveSnapped: midpoint mode lands on an edge midpoint of another mesh',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube') as import('three').Mesh;
 const b=st.addPrimitive('cube') as import('three').Mesh;
 st.setTransform(b.id,{position:{x:3}});
 st.editStart(a.id);
 const row=cornerRow(a,0.5,0.5,0.5);
 st.editSelect('vertex',[row]);
 const applied=st.editMoveSnapped([3.05,-0.55,0],'midpoint',0.25); // near B edge midpoint at world (3.5,0.5,0.5)
 assert.ok(Math.abs(applied[0]-3)<1e-6&&Math.abs(applied[1]+0.5)<1e-6&&Math.abs(applied[2])<1e-6,`snapped delta is exact, got ${applied}`);
 const p=rowAt(a,row);
 assert.ok(Math.abs(p[0]-3.5)<1e-6&&Math.abs(p[1]-0)<1e-6&&Math.abs(p[2]-0.5)<1e-6,`vertex sits on the edge midpoint (world 3.5,0.5,0.5), got ${p}`);
});

test('stage editMoveSnapped: the edited mesh own still geometry is a valid target',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(a.id);
 const row=cornerRow(a,0.5,0.5,0.5);
 st.editSelect('vertex',[row]);
 const applied=st.editMoveSnapped([-0.95,0,0],'vertex',0.25); // aims at the adjacent top corner of the same cube
 assert.ok(Math.abs(applied[0]+1)<1e-6&&Math.abs(applied[1])<1e-6&&Math.abs(applied[2])<1e-6,`snapped delta is exact, got ${applied}`);
 const p=rowAt(a,row);
 assert.ok(Math.abs(p[0]+0.5)<1e-6&&Math.abs(p[1]-0.5)<1e-6&&Math.abs(p[2]-0.5)<1e-6,`vertex sits on its own neighbour corner, got ${p}`);
});

test('stage editMoveSnapped: selected rows and their position twins are never targets',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(a.id);
 const row=cornerRow(a,0.5,0.5,0.5);
 st.editSelect('vertex',[row]);
 const applied=st.editMoveSnapped([0.05,0.05,0],'vertex',0.3); // only the corner itself (and its twins) are in reach
 assert.deepEqual(applied,[0.05,0.05,0],'no snap: the plain offset applies');
 const p=rowAt(a,row);
 assert.ok(Math.abs(p[0]-0.55)<1e-6&&Math.abs(p[1]-0.55)<1e-6,`vertex moved by the plain offset, got ${p}`);
});

test('stage editMoveSnapped: nothing within radius means the plain offset applies',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube') as import('three').Mesh;
 const b=st.addPrimitive('cube') as import('three').Mesh;
 st.setTransform(b.id,{position:{x:6,y:0,z:0}});
 st.editStart(a.id);
 const row=cornerRow(a,0.5,0.5,0.5);
 st.editSelect('vertex',[row]);
 const applied=st.editMoveSnapped([1.4,0,0],'vertex',0.25); // lands in empty space between the cubes
 assert.deepEqual(applied,[1.4,0,0]);
 const p=rowAt(a,row);
 assert.ok(Math.abs(p[0]-1.9)<1e-6&&Math.abs(p[1]-0.5)<1e-6,`vertex moved by the plain offset, got ${p}`);
});

test('stage editMoveSnapped: an edge whose endpoints both move with the selection is no midpoint target',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(a.id);
 const r1=cornerRow(a,0.5,0.5,0.5),r2=cornerRow(a,0.5,0.5,-0.5);
 st.editSelect('vertex',[r1,r2]); // the top right edge: its midpoint at world (0.5,1,0) moves with the selection
 const applied=st.editMoveSnapped([0,0.05,0],'midpoint',0.3);
 assert.deepEqual(applied,[0,0.05,0],'no snap onto the moving edge midpoint');
});

test('stage editMoveSnapped: a duplicate grab island snaps as one body, the original stays',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube') as import('three').Mesh;
 const b=st.addPrimitive('cube') as import('three').Mesh;
 st.setTransform(b.id,{position:{x:3}});
 st.editStart(a.id);
 st.editSelectAll('all','face');
 st.editDuplicate(); // island rows 24..47, grab armed
 const applied=st.editMoveSnapped([2.55,-0.55,0.45],'vertex',0.3); // island centre (0,0.5,0) aims near B corner (2.5,0,0.5)
 assert.ok(Math.abs(applied[0]-2.5)<1e-6&&Math.abs(applied[1]+0.5)<1e-6&&Math.abs(applied[2]-0.5)<1e-6,`snapped delta is exact, got ${applied}`);
 assert.ok(Math.abs(centroidY(a,0,24)-0)<1e-6,'the original shell did not move');
 assert.ok(Math.abs(centroidY(a,24,48)+0.5)<1e-6,'the island centre sits at the corner height (world y 0)');
 st.undo();
 assert.ok(Math.abs(centroidY(a,24,48)-0)<1e-6,'one undo moves the island back');
});
