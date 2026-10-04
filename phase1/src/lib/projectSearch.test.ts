import test from 'node:test';import assert from 'node:assert/strict';
import {searchProject,replaceInProject} from './projectSearch';
const o={regex:false,caseSensitive:false,wholeWord:false};const files={'a.html':'<h1>Hello</h1>\nhello again','b.css':'.hello{color:red}\nHELLOWORLD'};
test('search finds matches across files with positions',()=>{const r=searchProject(files,'hello',o);assert.equal(r.matches.length,4);assert.deepEqual([r.matches[0].file,r.matches[0].line,r.matches[0].col],['a.html',1,5]);
 assert.equal(searchProject(files,'hello',{...o,caseSensitive:true}).matches.length,2);assert.equal(searchProject(files,'hello',{...o,wholeWord:true}).matches.length,3);});
test('invalid or empty-matching patterns report errors, empty query returns nothing',()=>{assert.ok(searchProject(files,'(',{...o,regex:true}).error);assert.ok(searchProject(files,'a*',{...o,regex:true}).error);assert.equal(searchProject(files,'',o).matches.length,0);});
test('replace is literal by default and supports groups in regex mode',()=>{const r=replaceInProject({'x':'a.b a.b'},'a.b','$1 $&',o);assert.equal(r.changed['x'],'$1 $& $1 $&');assert.equal(r.count,2);
 const g=replaceInProject({'x':'color: red'},'(\\w+): (\\w+)','$2: $1',{...o,regex:true});assert.equal(g.changed['x'],'red: color');});
test('replace can be limited to chosen files',()=>{const r=replaceInProject(files,'hello','hi',o,new Set(['a.html']));assert.deepEqual(Object.keys(r.changed),['a.html']);});
