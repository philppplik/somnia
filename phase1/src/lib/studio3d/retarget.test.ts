import test from 'node:test';import assert from 'node:assert/strict';
import {mapBoneNames,normalizeBoneName,retargetClipName} from './retarget';
test('normalisation strips namespaces, case and separators',()=>{
 assert.equal(normalizeBoneName('mixamorig:Hips'),'hips');
 assert.equal(normalizeBoneName('Armature|Upper_Arm.L'),'upperarml');
 assert.equal(normalizeBoneName('Spine 02'),'spine02');
 assert.equal(normalizeBoneName('root'),'root');
});
test('mapping pairs exact names first, then normalised, each target once',()=>{
 const m=mapBoneNames(['Root','Spine','Arm.L','Tail'],['root','Spine','Arm.L','Wing']);
 assert.deepEqual(m.pairs,[{source:'Root',target:'root'},{source:'Spine',target:'Spine'},{source:'Arm.L',target:'Arm.L'}]);
 assert.deepEqual(m.unmatchedSource,['Tail']);
 assert.deepEqual(m.unmatchedTarget,['Wing']);
});
test('namespaced source names match plain target names',()=>{
 const m=mapBoneNames(['mixamorig:Hips','mixamorig:Spine'],['Hips','Spine']);
 assert.equal(m.pairs.length,2);
});
test('a duplicate source name cannot claim a target twice',()=>{
 const m=mapBoneNames(['Hips','Hips'],['Hips']);
 assert.equal(m.pairs.length,1);assert.deepEqual(m.unmatchedSource,['Hips']);
});
test('retarget clip names carry the source clip',()=>{
 assert.equal(retargetClipName('Walk'),'Retarget: Walk');
});
