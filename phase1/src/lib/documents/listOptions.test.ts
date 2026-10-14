import test from 'node:test';
import assert from 'node:assert/strict';
import {listOptionsProblem} from './protocol';
import {buildListPatch} from '../../components/documents/InfoDialogs';
const orig={format:'decimal',text:'%1.',start:1,indent:36,hanging:18};
test('the list dialog sends only what changed',()=>{
 assert.equal(buildListPatch(0,orig,{format:'decimal',text:'%1.',start:'1',indent:'36',hanging:'18'}),null);
 assert.deepEqual(buildListPatch(0,orig,{format:'decimal',text:'%1.',start:'7',indent:'36',hanging:'18'}),{level:0,start:7});
 assert.deepEqual(buildListPatch(0,orig,{format:'decimal',text:'(%1)',start:'1',indent:'36',hanging:'18'}),{level:0,text:'(%1)'});
 assert.deepEqual(buildListPatch(2,orig,{format:'upperRoman',text:'%1.%2.%3',start:'1',indent:'36',hanging:'18'}),{level:2,format:'upperRoman',text:'%1.%2.%3'});
});
test('the list dialog refuses values the engine would refuse',()=>{
 for(const f of [{format:'decimal',text:'%1.',start:'',indent:'36',hanging:'18'},{format:'decimal',text:'%1.',start:'-1',indent:'36',hanging:'18'},{format:'decimal',text:'%1.',start:'10000',indent:'36',hanging:'18'},{format:'decimal',text:'%1.',start:'1.5',indent:'36',hanging:'18'},{format:'decimal',text:'no number',start:'1',indent:'36',hanging:'18'},{format:'decimal',text:'%2.',start:'1',indent:'36',hanging:'18'},{format:'bullet',text:'ab',start:'1',indent:'36',hanging:'18'}] as const)assert.equal(buildListPatch(0,orig,f),null,JSON.stringify(f));
});
test('listOptionsProblem accepts good changes',()=>{
 assert.equal(listOptionsProblem({level:0,start:0}),null);
 assert.equal(listOptionsProblem({level:8,start:9999,format:'decimalZero',text:'%1.%9'}),null);
 assert.equal(listOptionsProblem({level:0,format:'bullet',text:'\u2022'}),null);
 assert.equal(listOptionsProblem({level:1,text:'%2)'},'lowerLetter'),null);
 assert.equal(listOptionsProblem({level:0,text:'*'},'bullet'),null);assert.notEqual(listOptionsProblem({level:0,text:'*'},'decimal'),null);
});
test('indent and hanging are sent in points and kept consistent',()=>{
 const f={format:'decimal',text:'%1.',start:'1'} as const;
 assert.deepEqual(buildListPatch(0,orig,{...f,indent:'54',hanging:'27,5'}),{level:0,indent:54,hanging:27.5});
 for(const [indent,hanging] of [['721','18'],['36','37'],['-1','0'],['x','18'],['36',''],['10','18']])assert.equal(buildListPatch(0,orig,{...f,indent,hanging}),null,indent+'/'+hanging);
 assert.equal(listOptionsProblem({level:0,hanging:50},undefined,{indent:36,hanging:18}),'The hanging indent cannot be larger than the indent.');
 assert.equal(listOptionsProblem({level:0,indent:60},undefined,{indent:36,hanging:18}),null);
 assert.notEqual(listOptionsProblem({level:0,indent:Number.NaN}),null);
});
