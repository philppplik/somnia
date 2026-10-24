import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkParaPatch,PARA_FLAG_KEYS} from './protocol';
import {buildParagraphPatch} from '../../components/documents/ParagraphDialog';
test('suppressLineNumbers is a boolean paragraph flag',()=>{
 assert.ok((PARA_FLAG_KEYS as readonly string[]).includes('suppressLineNumbers'));
 assert.doesNotThrow(()=>checkParaPatch({suppressLineNumbers:true}));
 for(const bad of ['yes',1,null])assert.throws(()=>checkParaPatch({suppressLineNumbers:bad} as never));
 const p=buildParagraphPatch(null,{suppressLineNumbers:true},'');assert.deepEqual(p,{suppressLineNumbers:true});
});
