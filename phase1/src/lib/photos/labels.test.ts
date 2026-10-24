import test from 'node:test';
import assert from 'node:assert/strict';
import {getLabel,isPhotoLabel,PHOTO_LABELS,setLabel} from './labels.ts';
test('labels set, cycle and clear per photo',()=>{
 assert.equal(getLabel('a.png'),null);
 setLabel('a.png','red');assert.equal(getLabel('a.png'),'red');
 setLabel('a.png','blue');assert.equal(getLabel('a.png'),'blue');
 setLabel('a.png',null);assert.equal(getLabel('a.png'),null);
});
test('labels reject invalid input and empty names',()=>{
 setLabel('b.png','purple' as never);assert.equal(getLabel('b.png'),null);
 setLabel('','red');assert.equal(getLabel(''),null);
 assert.ok(!isPhotoLabel('purple'));assert.ok(isPhotoLabel(PHOTO_LABELS[0]));
});
