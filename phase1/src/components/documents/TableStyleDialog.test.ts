import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTableStyle,INITIAL_FORM} from './TableStyleDialog';
import {tableStyleProblem} from '../../lib/documents/protocol';
test('the form only builds styles the engine accepts',()=>{
 assert.equal(buildTableStyle(INITIAL_FORM),null,'nothing chosen');
 assert.deepEqual(buildTableStyle({...INITIAL_FORM,fill:'F2F2F2',border:'thin',borderColor:'C0392B',rowHeight:'30',padding:'6.5'}),{fill:'F2F2F2',border:{width:0.5,color:'C0392B'},rowHeight:30,padding:6.5});
 assert.deepEqual(buildTableStyle({...INITIAL_FORM,border:'none',fill:'none',rowHeight:'0'}),{fill:'none',border:'none',rowHeight:0});
 for(const bad of ['401','abc','-1','1e2','0.5','1.234','','x'])if(bad!=='')assert.equal(buildTableStyle({...INITIAL_FORM,rowHeight:bad}),null,bad);
 for(const bad of ['73','abc','-1','1,5'])assert.equal(buildTableStyle({...INITIAL_FORM,padding:bad}),null,bad);
});
test('tableStyleProblem refuses malformed styles',()=>{
 for(const bad of [null,[],'x',{},{fill:3},{fill:'red'},{fill:'12345'},{border:5},{border:{width:0,color:'auto'}},{border:{width:13,color:'auto'}},{border:{width:1,color:'x'}},{border:{width:1,color:'auto',z:1}},{rowHeight:401},{rowHeight:0.5},{rowHeight:Number.NaN},{padding:73},{padding:'3'},{nope:1}])assert.notEqual(tableStyleProblem(bad),null,JSON.stringify(bad));
 for(const ok of [{fill:'none'},{fill:'c0392b'},{border:'none'},{border:{width:0.25,color:'auto'}},{border:{width:12,color:'AABBCC'}},{rowHeight:0},{rowHeight:400},{padding:0},{padding:72}])assert.equal(tableStyleProblem(ok),null,JSON.stringify(ok));
});
