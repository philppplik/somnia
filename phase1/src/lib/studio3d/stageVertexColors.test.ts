import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage} from './stage';
class NodeFileReader{result:string|ArrayBuffer|null=null;onloadend:(()=>void)|null=null;onerror:(()=>void)|null=null;
 readAsArrayBuffer(b:Blob){void b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();},()=>this.onerror?.());}
 readAsDataURL(b:Blob){void b.arrayBuffer().then(r=>{this.result=`data:${b.type||'application/octet-stream'};base64,${Buffer.from(r as ArrayBuffer).toString('base64')}`;this.onloadend?.();},()=>this.onerror?.());}}
(globalThis as unknown as {FileReader:unknown}).FileReader??=NodeFileReader;
(globalThis as unknown as {ProgressEvent:unknown}).ProgressEvent??=Event;
const mk=()=>{
 const st=new Stage();
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0xb8bcc8}));mesh.name='Box';
 st.loadMany([mesh]);st.root.updateMatrixWorld(true);
 return{st,mesh};
};
const colAttr=(m:THREE.Mesh)=>m.geometry.getAttribute('color') as THREE.BufferAttribute|undefined;
test('setVertexColors adds a linear fill, flips the material flag and undoes',()=>{
 const {st,mesh}=mk();
 st.setVertexColors(true,'#ff0000',[mesh.id]);
 const c=colAttr(mesh);assert.ok(c,'the color attribute exists');
 assert.equal(c.count,c.itemSize===3?mesh.geometry.getAttribute('position').count:0,'one rgb triple per vertex');
 for(let v=0;v<c.count;v++){assert.ok(Math.abs(c.getX(v)-1)<1e-4);assert.ok(Math.abs(c.getY(v))<1e-4);assert.ok(Math.abs(c.getZ(v))<1e-4);}
 assert.equal((mesh.material as THREE.MeshStandardMaterial).vertexColors,true,'the flag follows the attribute');
 st.undo();
 assert.ok(!colAttr(mesh),'undo removes the attribute');
 assert.equal((mesh.material as THREE.MeshStandardMaterial).vertexColors,false,'undo restores the flag');
 st.redo();
 assert.ok(colAttr(mesh),'redo re-adds the attribute');
 assert.equal((mesh.material as THREE.MeshStandardMaterial).vertexColors,true);
 st.setVertexColors(false,undefined,[mesh.id]);
 assert.ok(!colAttr(mesh));assert.equal((mesh.material as THREE.MeshStandardMaterial).vertexColors,false);
});
test('white is the default fill and a second fill recolours; no-ops are readable errors',()=>{
 const {st,mesh}=mk();
 st.setVertexColors(true,undefined,[mesh.id]);
 const c=colAttr(mesh)!;
 for(let v=0;v<c.count;v++)assert.ok(Math.abs(c.getX(v)-1)<1e-6&&Math.abs(c.getY(v)-1)<1e-6&&Math.abs(c.getZ(v)-1)<1e-6);
 assert.throws(()=>st.setVertexColors(true,undefined,[mesh.id]),/already has vertex colors/);
 st.setVertexColors(true,'#00ff00',[mesh.id]); // recolour is allowed
 assert.ok(Math.abs(colAttr(mesh)!.getY(0)-1)<1e-4);
 st.setVertexColors(false,undefined,[mesh.id]);
 assert.throws(()=>st.setVertexColors(false,undefined,[mesh.id]),/None of the selected meshes has vertex colors/);
 assert.throws(()=>st.setVertexColors(true,'red',[mesh.id]),/not a color/);
});
test('the flag flip clones the material so siblings sharing it stay untouched',()=>{
 const st=new Stage();const mat=new THREE.MeshStandardMaterial();
 const a=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),mat);a.name='A';
 const b=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),mat);b.name='B';
 st.loadMany([a,b]);
 st.setVertexColors(true,undefined,[a.id]);
 assert.notEqual(a.material,b.material,'the colored mesh got its own material copy');
 assert.equal((a.material as THREE.MeshStandardMaterial).vertexColors,true);
 assert.equal((b.material as THREE.MeshStandardMaterial).vertexColors,false,'the sibling keeps the shared material untouched');
});
test('edit ops carry the colors: move keeps them, subdivide interpolates them',()=>{
 const {st,mesh}=mk();
 st.setVertexColors(true,'#ff0000',[mesh.id]);
 colAttr(mesh)!.setXYZ(0,0,0,0); // one black corner so interpolation is visible
 const before=mesh.geometry.getAttribute('position').count;
 st.editStart(mesh.id);
 st.editSelect('vertex',Array.from({length:before},(_,i)=>i));
 st.editMove([0.1,0,0]);
 assert.ok(colAttr(mesh),'the attribute survives an edit move');
 assert.equal(colAttr(mesh)!.count,mesh.geometry.getAttribute('position').count,'still one triple per vertex');
 assert.equal(colAttr(mesh)!.getX(1),1,'untouched corners stay red');
 st.editEnd();
 st.subdivide(1,[mesh.id]);
 const c=colAttr(mesh);
 assert.ok(c,'the attribute survives subdivision');
 assert.equal(c!.count,mesh.geometry.getAttribute('position').count);
 let mid=false;
 for(let v=0;v<c!.count;v++){const r=c!.getX(v);assert.ok(r>=-1e-6&&r<=1+1e-6);if(r>1e-6&&r<1-1e-6)mid=true;}
 assert.ok(mid,'new vertices carry interpolated colors');
 assert.equal((mesh.material as THREE.MeshStandardMaterial).vertexColors,true,'the flag stays on');
});
test('an op that drops the attribute flips the material flag back off',()=>{
 const {st,mesh}=mk();
 st.setVertexColors(true,undefined,[mesh.id]);
 assert.equal((mesh.material as THREE.MeshStandardMaterial).vertexColors,true);
 st.remesh(8,[mesh.id]); // voxel rebuild: no colors survive
 assert.ok(!colAttr(mesh),'remesh drops the attribute');
 assert.equal((mesh.material as THREE.MeshStandardMaterial).vertexColors,false,'the flag follows so the mesh never renders black');
});
test('vertex colors export as COLOR_0 and come back through the loader',async()=>{
 const {GLTFExporter}=await import('three/examples/jsm/exporters/GLTFExporter.js');
 const {GLTFLoader}=await import('three/examples/jsm/loaders/GLTFLoader.js');
 const {st,mesh}=mk();
 st.setVertexColors(true,'#ff0000',[mesh.id]);
 const ex=new GLTFExporter();
 const out=await ex.parseAsync(st.exportScene(),{binary:false,onlyVisible:false,animations:[]}) as {meshes:{primitives:{attributes:Record<string,number>}[]}[]};
 assert.ok(out.meshes.some(m=>m.primitives.some(p=>'COLOR_0' in p.attributes)),'COLOR_0 is exported');
 const g=await new Promise<{scene:THREE.Group}>((res,rej)=>new GLTFLoader().parse(JSON.stringify(out),'',res as never,rej));
 const re=g.scene.getObjectByName('Box') as THREE.Mesh;
 const c=re.geometry.getAttribute('color') as THREE.BufferAttribute;
 assert.ok(c,'the reopened file has the color attribute');
 assert.ok(Math.abs(c.getX(0)-1)<1e-3&&Math.abs(c.getY(0))<1e-3,'the fill survives the roundtrip');
 assert.equal((re.material as THREE.MeshStandardMaterial).vertexColors,true,'the loader sets the flag');
});
test('a paint stroke tints only the dab radius and closes as one undo step',()=>{
 const {st,mesh}=mk();
 const nv=mesh.geometry.getAttribute('position').count;
 st.vcolPaintStart(mesh.id);
 assert.ok(colAttr(mesh),'the attribute appears at stroke start');
 assert.equal((mesh.material as THREE.MeshStandardMaterial).vertexColors,true,'the flag follows immediately');
 const n=st.vcolPaint(mesh.id,[0.5,0.5,0.5],{color:[1,0,0],radius:0.2,strength:1,falloff:'constant'});
 assert.ok(n>0,'the corner dab touches vertices');
 assert.ok(n<nv,'but not the whole box');
 st.vcolPaint(mesh.id,[-0.5,-0.5,-0.5],{color:[0,0,1],radius:0.2,strength:1,falloff:'constant'});
 st.vcolPaintEnd(mesh.id);
 const c=colAttr(mesh)!;
 let red=false,blue=false,white=false;
 for(let v=0;v<c.count;v++){const r=c.getX(v),b=c.getZ(v);if(r>0.9&&b<0.1)red=true;else if(b>0.9&&r<0.1)blue=true;else if(r>0.9&&b>0.9)white=true;}
 assert.ok(red&&blue&&white,'two dabs paint two corners, the rest stays white');
 st.undo();
 assert.ok(!colAttr(mesh),'one undo closes the whole stroke: the attribute created by it goes away again');
 assert.equal((mesh.material as THREE.MeshStandardMaterial).vertexColors,false);
 st.redo();
 assert.ok(colAttr(mesh),'redo repaints the stroke');
});
test('painting on an existing attribute undoes back to the pre-stroke colors',()=>{
 const {st,mesh}=mk();
 st.setVertexColors(true,'#ff0000',[mesh.id]);
 st.vcolPaintStart(mesh.id);
 st.vcolPaint(mesh.id,[0.5,0.5,0.5],{color:[0,1,0],radius:0.2,strength:1,falloff:'constant'});
 st.vcolPaintEnd(mesh.id);
 assert.ok(Math.abs(colAttr(mesh)!.getY(0)-1)<1e-4,'the dabbed corner is green now');
 st.undo();
 assert.ok(Math.abs(colAttr(mesh)!.getX(0)-1)<1e-4&&Math.abs(colAttr(mesh)!.getY(0))<1e-4,'undo brings back the red fill');
});
test('falloff shapes the dab and errors stay readable',()=>{
 const {st,mesh}=mk();
 assert.throws(()=>st.vcolPaint(mesh.id,[0,0,0],{color:[1,0,0],radius:1,strength:1,falloff:'smooth'}),/Start a paint stroke first/);
 st.vcolPaintStart(mesh.id);
 st.vcolPaint(mesh.id,[0.5,0.5,0.5],{color:[0,0,0],radius:1.2,strength:1,falloff:'smooth'}); // the three neighbouring corners (d=1) land in the falloff ring
 st.vcolPaintEnd(mesh.id);
 const pos=mesh.geometry.getAttribute('position');const c=colAttr(mesh)!;
 let sawMid=false;
 for(let v=0;v<c.count;v++){
  const d=Math.hypot(pos.getX(v)-0.5,pos.getY(v)-0.5,pos.getZ(v)-0.5);
  const r=c.getX(v);
  if(d<1e-6)assert.ok(r<0.01,'the dab centre is fully painted');
  else if(r>0.05&&r<0.95)sawMid=true;
 }
 assert.ok(sawMid,'smooth falloff leaves a gradient ring');
 st.vcolPaintEnd(mesh.id); // no open stroke: safe no-op
});
test('edit-mode fill colors only the selection, creates the attribute, undoes',()=>{
 const {st,mesh}=mk();
 st.editStart(mesh.id);
 st.editSelect('vertex',[0,1,2]);
 st.editVcolFill([1,0,0]);
 const c=colAttr(mesh)!;
 assert.ok(c,'the attribute is created by the fill');
 for(let v=0;v<c.count;v++){
  if(v<3)assert.ok(Math.abs(c.getX(v)-1)<1e-6&&Math.abs(c.getY(v))<1e-6,'the selection is red');
  else assert.ok(Math.abs(c.getX(v)-1)<1e-6&&Math.abs(c.getY(v)-1)<1e-6,'the rest stays white');
 }
 assert.equal((mesh.material as THREE.MeshStandardMaterial).vertexColors,true);
 st.undo();
 assert.ok(!colAttr(mesh),'undo removes the created attribute');
 st.redo();
 st.editVcolFill([0,1,0]); // recolor the same selection
 assert.ok(Math.abs(colAttr(mesh)!.getY(0)-1)<1e-6);
 st.editEnd();
});
test('edit-mode fill needs a selection; pick reads a color back',()=>{
 const {st,mesh}=mk();
 st.editStart(mesh.id);
 assert.throws(()=>st.editVcolFill([1,0,0]),/Select vertices to fill/);
 st.editSelect('vertex',[5]);
 st.editVcolFill([0.25,0.5,0.75]);
 assert.deepEqual(st.editVcolPick(5),[0.25,0.5,0.75]);
 const plain=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());plain.name='Plain';st.loadMany([plain]);
 st.editEnd();st.editStart(plain.id);
 assert.throws(()=>st.editVcolPick(0),/no vertex colors to pick/);
 assert.throws(()=>st.editVcolPick(99),/does not exist/);
 st.editEnd();
});
