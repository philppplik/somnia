import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';
import {facingFaces,type MeshData} from './editMesh';

const quad=():MeshData=>({positions:[0,0,0,1,0,0,1,1,0,0,1,0],index:[0,1,2,0,2,3]});

test('facingFaces: keeps faces whose normal is within the angle of the direction',()=>{
 assert.deepEqual(facingFaces(quad(),[0,0,1],45),[0,1],'both +z tris face +z');
 assert.deepEqual(facingFaces(quad(),[0,0,-1],45),[],'nothing faces -z');
 assert.deepEqual(facingFaces(quad(),[0,0,-1],180),[0,1],'180 degrees faces everything with a normal');
 assert.deepEqual(facingFaces(quad(),[0,1,1],45),[],'diagonal is 45 degrees off the +z normal... exactly on the limit is out');
 assert.deepEqual(facingFaces(quad(),[0,1,1],46),[0,1],'...and in just past it');
});

test('facingFaces validates direction and angle',()=>{
 assert.throws(()=>facingFaces(quad(),[0,0,0],45),/non-zero length/);
 assert.throws(()=>facingFaces(quad(),[0,0,Number.NaN],45),/non-zero length/);
 assert.throws(()=>facingFaces(quad(),[0,0,1],-1),/between 0 and 180/);
 assert.throws(()=>facingFaces(quad(),[0,0,1],181),/between 0 and 180/);
});

test('stage editSelectFacing: cube top and bottom, replaces the face selection',()=>{
 const st=new Stage();
 const m=st.addPrimitive('cube');
 st.editStart(m.id);
 st.editSelectFacing('+y');
 assert.equal(st.editSelection().faces.length,2,'top face pair');
 st.editSelectFacing('-y');
 assert.equal(st.editSelection().faces.length,2,'bottom face pair, selection replaced');
 st.editSelectFacing('+x',10);
 const xs=st.editSelection().faces;
 assert.equal(xs.length,2,'+x face pair');
});
