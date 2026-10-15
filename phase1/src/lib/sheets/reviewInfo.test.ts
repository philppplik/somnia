import test from 'node:test';import assert from 'node:assert/strict';
import {parseReviewCommand,parseReviewResult} from './reviewInfo';
test('review commands are closed shapes',()=>{
 for(const k of ['stats','accessibility','clear'])assert.deepEqual(parseReviewCommand({kind:k}),{kind:k});
 for(const bad of [null,[],{},{kind:'x'},{kind:'stats',y:1}])assert.throws(()=>parseReviewCommand(bad));
});
test('bridge answers are bounded',()=>{
 const st={sheet:{name:'S',endOfSheet:'C9',cellsWithData:3,formulas:1,tables:0,charts:0,comments:0},workbook:{sheets:1,cellsWithData:3,formulas:1,tables:0,charts:0,names:0}};
 assert.equal(parseReviewResult({stats:st}).stats?.sheet.endOfSheet,'C9');
 assert.equal(parseReviewResult({issues:[{sheet:0,sheetName:'S',code:'merged',object:null,count:2}],total:1}).issues?.issues[0].count,2);
 assert.throws(()=>parseReviewResult(null));assert.throws(()=>parseReviewResult({issues:[{sheet:0,sheetName:'S',code:'bad',object:null,count:null}],total:1}));
 assert.throws(()=>parseReviewResult({issues:Array(201).fill({sheet:0,sheetName:'S',code:'merged',object:null,count:null}),total:201}));
 assert.throws(()=>parseReviewResult({stats:{...st,sheet:{...st.sheet,formulas:-1}}}));
});
