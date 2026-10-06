import test from 'node:test';
import assert from 'node:assert/strict';
import {Text} from '@codemirror/state';
import {gutterDiagnostics} from './gutterDiagnostics';
import {projectProblems,type Problem} from './diagnostics';

const problem=(patch:Partial<Problem>={}):Problem=>({file:'index.html',line:2,col:3,severity:'warning',message:'Missing alt',...patch});
test('gutter diagnostics preserve Problems severity/message and one-based locations',()=>{
 const doc=Text.of(['<html>','  <img>','</html>']);
 assert.deepEqual(gutterDiagnostics(doc,'index.html',[problem(),problem({file:'other.html'}),problem({severity:'error',message:'Syntax'})]),[
  {from:9,to:10,severity:'warning',message:'Missing alt'},
  {from:9,to:10,severity:'error',message:'Syntax'}
 ]);
});
test('stale positions and EOF are clamped to the active document',()=>{
 const doc=Text.of(['a','']);
 assert.deepEqual(gutterDiagnostics(doc,'index.html',[problem({line:99,col:99}),problem({line:0,col:0})]).map(d=>[d.from,d.to]),[[2,2],[0,1]]);
 assert.deepEqual(gutterDiagnostics(Text.of(['']),'index.html',[problem()]).map(d=>[d.from,d.to]),[[0,0]]);
});
test('gutter includes the same syntax, reference and accessibility problems as the panel',()=>{
 const source='<html>\n<head><link rel="stylesheet" href="missing.css"></head>\n<body>\n<img src="hero.png">\n<div><span>x</div>\n</body></html>';
 const problems=projectProblems({'index.html':source});
 const diagnostics=gutterDiagnostics(Text.of(source.split('\n')),'index.html',problems);
 assert.deepEqual(diagnostics.map(d=>[d.severity,d.message]),problems.map(p=>[p.severity,p.message]));
 assert.ok(diagnostics.some(d=>d.severity==='error'));
 assert.ok(diagnostics.some(d=>d.message.includes('Stylesheet not found')));
 assert.ok(diagnostics.some(d=>d.message.includes('Image has no alt')));
 assert.equal(gutterDiagnostics(Text.of(['clean']),'other.html',problems).length,0);
});
