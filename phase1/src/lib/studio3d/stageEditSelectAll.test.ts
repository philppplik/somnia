import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage,StageError} from './stage';

test('editSelectAll: all, none and invert per element kind on a cube',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube');
 st.editStart(o.id);
 st.editSelectAll('all','vertex');
 assert.equal(st.editSelection().verts.length,24);
 st.editSelectAll('invert','vertex');
 assert.equal(st.editSelection().verts.length,0);
 st.editSelectAll('invert','vertex');
 assert.equal(st.editSelection().verts.length,24);
 st.editSelectAll('none','vertex');
 assert.equal(st.editSelection().verts.length,0);
 st.editSelectAll('all','face');
 assert.equal(st.editSelection().faces.length,12);
 st.editSelectAll('invert','face');
 assert.equal(st.editSelection().faces.length,0);
 st.editSelectAll('all','edge');
 const e=st.editSelection().edges.length;
 assert.ok(e>0,'cube has selectable edges');
 st.editSelectAll('invert','edge');
 assert.equal(st.editSelection().edges.length,0);
 st.editSelectAll('none','edge');
 st.editSelectAll('invert','edge');
 assert.equal(st.editSelection().edges.length,e,'invert of empty selects every edge');
});

test('editSelectGrow: vertex and face growth stay inside one split cube side',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube');
 st.editStart(o.id);
 st.editSelect('vertex',[0]);
 st.editSelectGrow(1,false,'vertex');
 assert.deepEqual(st.editSelection().verts,[0,1,2],'one grow adds the direct neighbours');
 st.editSelectGrow(1,false,'vertex');
 assert.equal(st.editSelection().verts.length,4,'second grow fills the quad of the corner');
 st.editSelectGrow(4,false,'vertex');
 assert.equal(st.editSelection().verts.length,4,'growth saturates at the split side');
 st.editSelectAll('none','vertex');
 st.editSelect('face',[0]);
 st.editSelectGrow(1,false,'face');
 assert.deepEqual(st.editSelection().faces,[0,1],'face grow adds the twin triangle of the quad');
 st.editSelectGrow(3,false,'face');
 assert.equal(st.editSelection().faces.length,2,'split cube sides stay separate');
 st.editSelectAll('none','face');
 st.editSelect('edge',[[0,1]]);
 st.editSelectGrow(1,false,'edge');
 assert.equal(st.editSelection().edges.length,4,'edge grow adds the edges touching the seed');
 st.editSelectGrow(1,false,'edge');
 assert.equal(st.editSelection().edges.length,5,'second grow fills the five edges of the quad');
});

test('editSelectGrow: shrink peels the grown shell back on a sphere',()=>{
 const st=new Stage();
 const o=st.addPrimitive('sphere');
 st.editStart(o.id);
 st.editSelect('vertex',[600]);
 st.editSelectGrow(1,false,'vertex');
 const c1=st.editSelection().verts.length;
 assert.ok(c1>1,'grow adds neighbours');
 st.editSelectGrow(1,false,'vertex');
 const c2=st.editSelection().verts.length;
 assert.ok(c2>c1,'second grow widens the disc');
 st.editSelectGrow(1,true,'vertex');
 const c3=st.editSelection().verts.length;
 assert.ok(c3>0&&c3<c2,'shrink peels the outer shell');
 assert.throws(()=>{st.editSelectAll('none','vertex');st.editSelectGrow(1,false,'vertex');},StageError);
});

test('editSelectAll and editSelectGrow need an active edit session',()=>{
 const st=new Stage();
 st.addPrimitive('cube');
 assert.throws(()=>st.editSelectAll('all','vertex'),StageError);
 assert.throws(()=>st.editSelectGrow(1,false,'face'),StageError);
});
