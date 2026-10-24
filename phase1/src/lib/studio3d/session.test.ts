import test from 'node:test';
import assert from 'node:assert/strict';
import {getStudio3DState,patchStudio3D,resetStudio3D} from './session';
test('viewport readiness starts false and survives scene resets',()=>{
 assert.equal(getStudio3DState().viewportReady,false);
 patchStudio3D({viewportReady:true});
 resetStudio3D({status:'ready',blank:true});
 assert.equal(getStudio3DState().viewportReady,true);
 assert.equal(getStudio3DState().status,'ready');
 assert.equal(getStudio3DState().blank,true);
 resetStudio3D();
 assert.equal(getStudio3DState().viewportReady,true);
});
test('a scene reset still clears the scene state while readiness is kept',()=>{
 patchStudio3D({viewportReady:true});
 resetStudio3D({status:'ready',name:'cube.glb',blank:false});
 resetStudio3D();
 assert.equal(getStudio3DState().viewportReady,true);
 assert.equal(getStudio3DState().status,'idle');
 assert.equal(getStudio3DState().name,'');
 assert.equal(getStudio3DState().selected,null);
 patchStudio3D({viewportReady:false});
});
