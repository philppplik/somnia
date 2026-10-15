import assert from 'node:assert/strict';
import {test} from 'node:test';
import {variantPatch} from './HeaderFooterVariantsDialog';
const v={header:{text:'H',editable:true},footer:{text:'F',pageNumber:false,editable:true}};
test('variantPatch only carries changed, editable parts',()=>{
 assert.deepEqual(variantPatch(v,{header:'H',footer:'F',page:false}),{});
 assert.deepEqual(variantPatch(v,{header:'X',footer:'F',page:true}),{header:'X',pageNumber:true});
 assert.deepEqual(variantPatch({...v,header:{text:'H',editable:false}},{header:'X',footer:'G',page:false}),{footer:'G'});
});
