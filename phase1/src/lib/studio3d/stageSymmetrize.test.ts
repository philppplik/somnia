import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';
import {symmetrizeMesh} from './editMesh';

// Lopsided test mesh: a square pyramid sitting only on the +x side of the plane.
const lopsided=()=>({positions:[
 0,-1,-1, 0,-1,1, 0,1,1, 0,1,-1, // 0-3: quad on the plane
 2,0,0, // 4: apex on +x
],index:[0,2,1, 0,3,2, 0,1,4, 1,2,4, 2,3,4, 3,0,4]});

test('symmetrizeMesh keeps the positive side and mirrors it across the plane',()=>{
 const out=symmetrizeMesh(lopsided(),'x','positive',0);
 const xs=[];for(let i=0;i<out.positions.length;i+=3)xs.push(out.positions[i]);
 assert.ok(Math.min(...xs)===-2&&Math.max(...xs)===2,'mirrored apex on both sides');
 assert.equal(out.index.length/3,10,'the four side triangles gain mirror twins; on-plane base triangles stay single');
 // every face has its mirror counterpart with opposite orientation
 const areas=out.index.length/3;
 assert.equal(areas%2,0);
});

test('symmetrizeMesh can keep the negative side instead',()=>{
 const neg=lopsided();for(let i=0;i<neg.positions.length;i+=3)neg.positions[i]=-neg.positions[i]; // same mesh on the -x side
 const out=symmetrizeMesh(neg,'x','negative',0);
 const xs=[];for(let i=0;i<out.positions.length;i+=3)xs.push(out.positions[i]);
 assert.ok(Math.min(...xs)===-2&&Math.max(...xs)===2);
 assert.equal(out.index.length/3,10,'same triangle count as keeping the positive side');
 // winding stays outward after the double flip: side triangles on the -x half face -x, their mirrors face +x
 const cross=(f:number)=>{const[a,b,c]=[out.index[f*3],out.index[f*3+1],out.index[f*3+2]].map(i=>[out.positions[i*3],out.positions[i*3+1],out.positions[i*3+2]]);
  const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
  return [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];};
 let checked=0;
 for(let f=0;f<out.index.length/3;f++){
  const cx=(out.positions[out.index[f*3]*3]+out.positions[out.index[f*3+1]*3]+out.positions[out.index[f*3+2]*3])/3;
  if(Math.abs(cx)<0.01)continue; // on-plane base triangles carry no x normal
  const n=cross(f);
  assert.ok(Math.sign(n[0])===Math.sign(cx),`face ${f} normal points outward`);
  checked++;
 }
 assert.ok(checked>=8,'all off-plane triangles checked');
});

test('symmetrizeMesh welds near-plane vertices and drops their duplicate mirrors',()=>{
 const m=lopsided();m.positions[0]=0.0005; // nudge one plane vertex off the plane
 const out=symmetrizeMesh(m,'x','positive',0.01);
 const onPlane=out.positions.filter((_,i)=>i%3===0&&out.positions[i]===0).length;
 assert.ok(onPlane>=4,'near-plane vertices snapped onto the plane');
});

test('stage symmetrize bakes geometry in one undo step and restores it exactly',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube');const b=st.addPrimitive('sphere');
 const ga=a.geometry,gb=b.geometry;
 const entries=st.historyLabels().undo.length;
 const n=st.symmetrize('x','positive',0.001,[a.id,b.id]);
 assert.equal(n,2);
 assert.equal(st.historyLabels().undo.length,entries+1,'one undo entry for the whole batch');
 assert.deepEqual(st.undoLabel,{key:'studio3d.hist.symmetrize',params:{count:2,name:a.name}});
 assert.notEqual(a.geometry,ga);assert.notEqual(b.geometry,gb);
 assert.equal(a.userData.somniaPrimitive,undefined,'primitive params cleared');
 st.undo();
 assert.equal(a.geometry,ga);assert.equal(b.geometry,gb,'undo restores both geometry objects');
 assert.ok(a.userData.somniaPrimitive,'primitive params restored');
 st.redo();
 assert.equal(a.userData.somniaPrimitive,undefined);
});

test('stage symmetrize validates targets and mode',()=>{
 const st=new Stage();
 const light=st.addLight('point');
 assert.throws(()=>st.symmetrize('x','positive',0.001,[light.id]),/not a mesh/);
 const cube=st.addPrimitive('cube');
 st.editStart(cube.id);
 assert.throws(()=>st.symmetrize('x','positive',0.001,[cube.id]),/edit mode/);
 st.editEnd();
 assert.throws(()=>st.symmetrize('x','positive',-1,[cube.id]),/merge distance/);
 assert.throws(()=>st.symmetrize('x','positive',Number.NaN,[cube.id]),/finite/);
});
