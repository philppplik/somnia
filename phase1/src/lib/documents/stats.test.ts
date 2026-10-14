import test from 'node:test';
import assert from 'node:assert/strict';
import {detailedStats} from './stats';
import {propertiesProblem,MAX_PROPERTY_CHARS,MAX_DESCRIPTION_CHARS} from './protocol';
import {infoDialog,setInfoDialog} from './infoDialog';
test('detailed stats',()=>{
 assert.deepEqual(detailedStats(''),{words:0,chars:0,charsNoSpaces:0,sentences:0,paragraphs:0,readingMinutes:0});
 const s=detailedStats('Hello there. How are you?\n\nFine!');
 assert.equal(s.words,6);assert.equal(s.sentences,3);assert.equal(s.paragraphs,2);assert.equal(s.readingMinutes,1);
 assert.equal(detailedStats('no end').sentences,1);
 assert.equal(detailedStats('word '.repeat(401)).readingMinutes,3);
 assert.equal(detailedStats('3.14 is pi').sentences,1);
});
test('properties are bounded plain text',()=>{
 assert.equal(propertiesProblem({title:'Report',creator:'Ada'}),null);
 assert.equal(propertiesProblem({description:'a\nb'}),null);
 for(const bad of [null,[],{},{nope:'x'},{title:1},{title:'x'.repeat(MAX_PROPERTY_CHARS+1)},{title:'a\nb'},{title:'bell\u0007'},{description:'x'.repeat(MAX_DESCRIPTION_CHARS+1)}])assert.notEqual(propertiesProblem(bad),null,JSON.stringify(bad));
 assert.equal(propertiesProblem({title:'x'.repeat(MAX_PROPERTY_CHARS)}),null);
});
test('info dialog state',()=>{setInfoDialog('wordCount');assert.equal(infoDialog(),'wordCount');setInfoDialog(null);assert.equal(infoDialog(),null);});
