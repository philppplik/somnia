import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkAccessibility,BLANK_RUN} from './accessibility';
import type {DocBlock} from './edit';
const p=(index:number,text:string,o:Partial<DocBlock>={}):DocBlock=>({index,kind:'para',text,editable:true,outline:null,...o});
test('a clean document has no issues',()=>{
 assert.deepEqual(checkAccessibility([p(0,'Title',{outline:0}),p(1,'Text'),p(2,'Part',{outline:1}),p(3,'more')],100),[]);
});
test('pictures without alt text, empty headings and skipped levels are found in order',()=>{
 const r=checkAccessibility([p(0,'A',{outline:0}),p(1,'',{image:{w:10,h:10,alt:' '}}),p(2,'C',{outline:2}),p(3,'  ',{outline:1}),p(4,'',{image:{w:1,h:1,alt:'a dog'}})],10);
 assert.deepEqual(r.map(x=>[x.kind,x.block]),[['noAlt',1],['headingSkip',2],['emptyHeading',3]]);
 assert.equal(r[1].level,3);assert.equal(r[1].from,1);assert.equal(r[1].quote,'C');
});
test('blank paragraphs count only in runs and not around pictures, breaks or other blocks',()=>{
 const blanks=(from:number,n:number)=>Array.from({length:n},(_,i)=>p(from+i,''));
 assert.deepEqual(checkAccessibility([...blanks(0,BLANK_RUN-1),p(9,'x')],1),[]);
 assert.deepEqual(checkAccessibility([p(0,'x'),...blanks(1,BLANK_RUN),p(9,'y')],1).map(x=>[x.kind,x.block]),[['blankRun',1]]);
 assert.deepEqual(checkAccessibility([...blanks(0,2),{index:2,kind:'table',editable:false},...blanks(3,2)],1),[],'a table ends the run');
 assert.deepEqual(checkAccessibility([p(0,''),p(1,'',{sectionBreak:'nextPage'}),p(2,''),p(3,'')],1),[],'a section break is not blank');
 assert.deepEqual(checkAccessibility([p(0,'',{image:{w:1,h:1,alt:'x'}}),p(1,''),p(2,'')],1),[]);
});
test('a long document without headings is flagged once, a short one is not',()=>{
 assert.deepEqual(checkAccessibility([p(0,'x')],600).map(x=>x.kind),['noHeadings']);
 assert.deepEqual(checkAccessibility([p(0,'x')],499),[]);assert.deepEqual(checkAccessibility([p(0,'x',{outline:0})],600),[]);
});
test('the list is bounded',()=>{
 const many=Array.from({length:50},(_,i)=>p(i,'',{image:{w:1,h:1,alt:''}}));
 assert.equal(checkAccessibility(many,1,10).length,10);
});
