import test from 'node:test';
import assert from 'node:assert/strict';
import {computeDiagnostics,projectProblems} from './diagnostics';
test('unclosed tags are reported with a line number',()=>{
 const p=computeDiagnostics('index.html','<html>\n<body>\n<div>\n<p>ok</p>\n</body></html>');
 assert.ok(p.some(x=>/Missing closing tag <\/div>/.test(x.message)&&x.line===3),JSON.stringify(p));});
test('clean files and unknown types give no problems',()=>{
 assert.deepEqual(computeDiagnostics('a.html','<p>hi</p>'),[]);assert.deepEqual(computeDiagnostics('a.png','<div>'),[]);});
test('project problems list errors before warnings',()=>{
 const p=projectProblems({'a.html':'<div>','b.css':'a{color:red;'});assert.ok(p.length>0);});
