import test from 'node:test';
import assert from 'node:assert/strict';
import {sculptDab,paintMask} from './sculpt';
import type {MeshData} from './editMesh';

// Flat 3x3 grid in the xz plane (9 verts, 8 tris), 1 unit wide, centered on origin.
function grid():MeshData{
 const positions:number[]=[];
 for(const z of[-0.5,0,0.5])for(const x of[-0.5,0,0.5])positions.push(x,0,z);
 const v=(ix:number,iz:number)=>iz*3+ix;
 const q=(a:number,b:number,c:number,d:number)=>[a,b,c,a,c,d];
 const index:number[]=[...q(v(0,0),v(1,0),v(1,1),v(0,1)),...q(v(1,0),v(2,0),v(2,1),v(1,1)),...q(v(0,1),v(1,1),v(1,2),v(0,2)),...q(v(1,1),v(2,1),v(2,2),v(1,2))];
 return{positions,index};
}
const at=(m:MeshData,i:number):[number,number,number]=>[m.positions[i*3],m.positions[i*3+1],m.positions[i*3+2]];

test('grab moves the centre vertex by the full delta and respects falloff',()=>{
 const m=grid();
 const out=sculptDab(m,[0,0,0],{brush:'grab',radius:0.6,strength:1,falloff:'constant',delta:[0,0.5,0],symmetry:'none'});
 assert.deepEqual(at(out,4),[0,0.5,0]);
 const cornerBefore=at(m,0),cornerAfter=at(out,0);
 assert.ok(cornerAfter[1]===0,`corner untouched, was ${cornerBefore[1]} -> ${cornerAfter[1]}`);
});

test('grab smooth falloff moves distant vertices less',()=>{
 const m=grid();
 const out=sculptDab(m,[0,0,0],{brush:'grab',radius:1,strength:1,falloff:'smooth',delta:[0,1,0],symmetry:'none'});
 const centreY=at(out,4)[1],sideY=at(out,1)[1],cornerY=at(out,0)[1];
 assert.ok(centreY>sideY&&sideY>cornerY&&cornerY>0,`${centreY} ${sideY} ${cornerY}`);
});

test('grab needs a drag vector',()=>{
 assert.throws(()=>sculptDab(grid(),[0,0,0],{brush:'grab',radius:1,strength:1,falloff:'smooth',symmetry:'none'}),/drag vector/);
});

test('smooth relaxes a spike toward its neighbours',()=>{
 const m=grid();m.positions[4*3+1]=1; // spike at the centre
 const out=sculptDab(m,[0,0,0],{brush:'smooth',radius:1.2,strength:1,falloff:'constant',symmetry:'none'});
 const y=at(out,4)[1];
 assert.ok(y<1&&y>0,`spike relaxed to ${y}`);
});

test('inflate pushes along vertex normals',()=>{
 const m=grid();
 const out=sculptDab(m,[0,0,0],{brush:'inflate',radius:0.6,strength:1,falloff:'constant',symmetry:'none'});
 // flat grid normals point +-y; the centre must move off the plane
 assert.ok(Math.abs(at(out,4)[1])>0.05,JSON.stringify(at(out,4)));
 assert.ok(Math.abs(at(out,4)[0])<1e-9&&Math.abs(at(out,4)[2])<1e-9,'no sideways drift');
});

test('symmetry mirrors the dab across the axis',()=>{
 const m=grid();
 const out=sculptDab(m,[0.5,0,0],{brush:'grab',radius:0.4,strength:1,falloff:'constant',delta:[0.1,0,0],symmetry:'x'});
 // vertex 5 sits at x=+0.5, vertex 3 at x=-0.5: both move, in mirrored directions
 assert.ok(Math.abs(at(out,5)[0]-0.6)<1e-9,JSON.stringify(at(out,5)));
 assert.ok(Math.abs(at(out,3)[0]+0.6)<1e-9,JSON.stringify(at(out,3)));
});

test('strength scales the effect',()=>{
 const m=grid();
 const weak=sculptDab(m,[0,0,0],{brush:'grab',radius:0.6,strength:0.2,falloff:'constant',delta:[0,1,0],symmetry:'none'});
 assert.ok(Math.abs(at(weak,4)[1]-0.2)<1e-9);
});

test('validation: radius, strength, centre',()=>{
 const m=grid();
 assert.throws(()=>sculptDab(m,[0,0,0],{brush:'smooth',radius:0,strength:1,falloff:'smooth',symmetry:'none'}),/radius/);
 assert.throws(()=>sculptDab(m,[0,0,0],{brush:'smooth',radius:1,strength:2,falloff:'smooth',symmetry:'none'}),/strength/);
 assert.throws(()=>sculptDab(m,[0,Number.NaN,0],{brush:'smooth',radius:1,strength:1,falloff:'smooth',symmetry:'none'}),/centre/);
});

test('dab never changes the index or vertex count',()=>{
 const m=grid();
 const out=sculptDab(m,[0,0,0],{brush:'inflate',radius:10,strength:1,falloff:'constant',symmetry:'z'});
 assert.equal(out.positions.length,m.positions.length);
 assert.deepEqual(out.index,m.index);
});

test('crease carves a valley opposite to inflate',()=>{
 const m=grid();
 const out=sculptDab(m,[0,0,0],{brush:'crease',radius:0.6,strength:1,falloff:'constant',symmetry:'none'});
 const y=at(out,4)[1];
 assert.ok(Math.abs(y)>0.005,`centre moved: ${y}`);
 const inf=sculptDab(m,[0,0,0],{brush:'inflate',radius:0.6,strength:1,falloff:'constant',symmetry:'none'});
 assert.ok(Math.sign(y)!==Math.sign(at(inf,4)[1]),'crease goes the other way');
});

test('pinch pulls vertices toward the centre',()=>{
 const m=grid();
 const out=sculptDab(m,[0,0,0],{brush:'pinch',radius:1,strength:0.5,falloff:'constant',symmetry:'none'});
 const before=Math.hypot(...at(m,2).filter((_,i)=>i!==1));
 const after=Math.hypot(at(out,2)[0],at(out,2)[2]);
 assert.ok(after<before,`${before} -> ${after}`);
 assert.ok(at(out,2)[1]===0,'stays on the plane toward a planar centre');
});

test('flatten pulls vertices onto the centre plane',()=>{
 const m=grid();m.positions[4*3+1]=0.6; // spike
 const out=sculptDab(m,[0,0,0],{brush:'flatten',radius:1.2,strength:1,falloff:'constant',symmetry:'none'});
 assert.ok(Math.abs(at(out,4)[1])<0.01,`spike flattened to ${at(out,4)[1]}`);
});

test('a fully masked vertex does not move, a partial one moves less',()=>{
 const m=grid();
 m.mask=new Array(9).fill(0);m.mask[4]=1;m.mask[1]=0.5;
 const out=sculptDab(m,[0,0,0],{brush:'grab',radius:1,strength:1,falloff:'constant',delta:[0,1,0],symmetry:'none'});
 assert.ok(at(out,4)[1]===0,'masked centre protected');
 assert.ok(Math.abs(at(out,1)[1]-0.5)<1e-9,'half-masked side moved half');
});

test('paintMask paints and erases within the radius',()=>{
 const m=grid();
 const painted=paintMask(m,[0,0,0],{radius:0.6,strength:1,falloff:'constant'});
 assert.equal(painted.length,9);
 assert.ok(painted[4]===1&&painted[0]===0,JSON.stringify(painted));
 const withMask:MeshData={...m,mask:painted};
 const erased=paintMask(withMask,[0,0,0],{radius:0.6,strength:1,falloff:'constant',erase:true});
 assert.ok(erased[4]===0);
 assert.throws(()=>paintMask(m,[0,0,0],{radius:0,strength:1,falloff:'smooth'}),/radius/);
});
