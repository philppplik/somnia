import {test} from 'node:test';import assert from 'node:assert/strict';
import {cleanStyleName,parseCustomStyles,parseCellToolCommand,cellToolProblem,toolFromChoice,parseFunctionCatalog,functionFormulaStart,filterFunctions,functionCategories,CELL_STYLES,isFunctionName} from './cellToolOps';
test('cell tool commands are closed shapes',()=>{
 assert.deepEqual(parseCellToolCommand({kind:'style',name:'Good'}),{kind:'style',name:'Good'});
 assert.deepEqual(parseCellToolCommand({kind:'autoSum',function:'AVERAGE'}),{kind:'autoSum',function:'AVERAGE'});
 for(const k of ['insertCheckbox','toggleCheckbox','pickFormat','pasteFormat'])assert.deepEqual(parseCellToolCommand({kind:k}),{kind:k});
 for(const bad of [null,[],{},{kind:'style'},{kind:'style',name:''},{kind:'style',name:'Good',x:1},{kind:'autoSum'},{kind:'autoSum',function:'EVIL'},{kind:'pickFormat',x:1},{kind:'sticky'}])assert.throws(()=>parseCellToolCommand(bad),JSON.stringify(bad));
 assert.equal(CELL_STYLES.length,23);
});
test('block checks and the select choice are bounded',()=>{
 assert.equal(cellToolProblem({kind:'insertCheckbox'},400,300),'many');assert.equal(cellToolProblem({kind:'insertCheckbox'},100,100),null);
 assert.equal(cellToolProblem({kind:'style',name:'Good'},2000,1000),'cells');assert.equal(cellToolProblem({kind:'pickFormat'},0,1),'cells');
 assert.deepEqual(toolFromChoice('style:Currency [0]'),{kind:'style',name:'Currency [0]'});assert.deepEqual(toolFromChoice('sum:MAX'),{kind:'autoSum',function:'MAX'});assert.deepEqual(toolFromChoice('pasteFormat'),{kind:'pasteFormat'});
 assert.equal(toolFromChoice('style:'),null);assert.equal(toolFromChoice('sum:EVIL'),null);assert.equal(toolFromChoice(''),null);
});
test('the function library is parsed strictly and only opens a formula',()=>{
 const list=parseFunctionCatalog({functions:[{name:'VLOOKUP',category:'Lookup',signature:'VLOOKUP(a,b)',description:'Looks up.'},{name:'SUM',category:'Math',signature:'SUM(a)',description:'Adds numbers.'}]});
 assert.equal(list.length,2);assert.equal(functionFormulaStart('sum'),'=SUM(');assert.equal(functionFormulaStart('NORM.DIST'),'=NORM.DIST(');
 for(const bad of [null,{},{functions:'x'},{functions:[null]},{functions:[{name:'A B',category:'x'}]},{functions:[{name:'=EVIL()'}]},{functions:Array.from({length:1001},()=>({name:'A'}))}])assert.throws(()=>parseFunctionCatalog(bad),JSON.stringify(bad).slice(0,60));
 for(const bad of ['','1A','A(','SUM)','a'.repeat(65),'A\nB',5,null])assert.throws(()=>functionFormulaStart(bad));
 assert.ok(isFunctionName('IF'));
 assert.deepEqual(filterFunctions(list,'','look').map(f=>f.name),['VLOOKUP']);assert.deepEqual(filterFunctions(list,'Math','').map(f=>f.name),['SUM']);assert.equal(filterFunctions(list,'','').length,2);
 assert.deepEqual(functionCategories(list),['Lookup','Math']);
 const many=Array.from({length:500},(_,i)=>({name:'F'+i,category:'X',signature:'',description:''}));assert.equal(filterFunctions(many,'','').length,200);
});

test('custom styles: names are bounded and never shadow a built-in',()=>{
 assert.equal(cleanStyleName('  Brand  '),'Brand');assert.equal(cleanStyleName('good'),null);assert.equal(cleanStyleName(''),null);assert.equal(cleanStyleName('x'.repeat(61)),null);assert.equal(cleanStyleName('a\u0007b'),null);assert.equal(cleanStyleName(5),null);
 assert.deepEqual(parseCellToolCommand({kind:'newStyle',name:' Brand '}),{kind:'newStyle',name:'Brand'});
 assert.deepEqual(parseCellToolCommand({kind:'deleteStyle',name:' Brand '}),{kind:'deleteStyle',name:'Brand'});assert.deepEqual(parseCellToolCommand({kind:'renameStyle',name:'Brand',newName:'Logo'}),{kind:'renameStyle',name:'Brand',newName:'Logo'});
 for(const bad of [{kind:'deleteStyle',name:'Good'},{kind:'deleteStyle'},{kind:'renameStyle',name:'Brand'},{kind:'renameStyle',name:'Brand',newName:'Good'},{kind:'renameStyle',name:'Brand',newName:'A',x:1}])assert.throws(()=>parseCellToolCommand(bad),JSON.stringify(bad));
 assert.throws(()=>parseCellToolCommand({kind:'newStyle',name:'Good'}));assert.throws(()=>parseCellToolCommand({kind:'newStyle',name:'A',extra:1}));
 assert.deepEqual(parseCellToolCommand({kind:'style',name:'Brand'}),{kind:'style',name:'Brand'});assert.throws(()=>parseCellToolCommand({kind:'style',name:'x'.repeat(61)}));
 assert.deepEqual(toolFromChoice('custom:Brand: 2'),{kind:'style',name:'Brand: 2'});assert.equal(toolFromChoice('newStyle'),null);
 assert.deepEqual(parseCustomStyles({styles:['A','B']}),['A','B']);assert.throws(()=>parseCustomStyles({styles:[1]}));assert.throws(()=>parseCustomStyles({styles:Array(51).fill('a')}));assert.throws(()=>parseCustomStyles(null));
});
