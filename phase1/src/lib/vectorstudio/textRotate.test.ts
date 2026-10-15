import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleLocal,handlePoint,rotationFor,SNAP_DEGREES,HANDLE_GAP_PX} from './textRotate';
import {textBox,type VectorText} from '../vectorio';
const T=(p:Partial<VectorText>={}):VectorText=>({id:'t',x:100,y:100,text:'Hello',fontFamily:'Arial',fontSize:20,fontWeight:'normal',fontStyle:'normal',anchor:'start',fill:'#000000',...p});
const near=(a:number,b:number,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} vs ${b}`);
test('handle sits above the box centre and keeps a constant screen distance',()=>{
 const t=T(),b=textBox(t),h=handleLocal(t,2);near(h.x,(b.minX+b.maxX)/2);near(h.y,b.minY-HANDLE_GAP_PX/2);
 assert.throws(()=>handleLocal(t,0),RangeError);assert.throws(()=>handleLocal(t,NaN),RangeError);
});
test('handle point follows the rotation about the anchor',()=>{
 const t=T({rotation:90}),l=handleLocal(t,1),p=handlePoint(t,1);
 near(p.x,100-(l.y-100));near(p.y,100+(l.x-100));
});
test('rotationFor inverts handlePoint, snaps with shift and ignores bad input',()=>{
 for(const r of [0,30,-45,90,179,-170]){const t=T({rotation:r});near(rotationFor({...t,rotation:0},handlePoint(t,1.5),1.5),r,0.06);}
 const t=T();const p=handlePoint({...t,rotation:37},1);assert.equal(rotationFor(t,p,1,true)%SNAP_DEGREES,0);assert.equal(rotationFor(t,p,1,true),30);
 assert.equal(rotationFor(T({rotation:12}),{x:NaN,y:3},1),12);
 const r=rotationFor(t,{x:1e12,y:-1e12},1);assert.ok(r>=-180&&r<=180);
 assert.equal(Object.is(rotationFor(t,handlePoint(t,1),1),-0),false);
});
