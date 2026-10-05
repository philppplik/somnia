import test from 'node:test';
import assert from 'node:assert/strict';
import {computeDiagnostics,projectProblems,referenceProblems} from './diagnostics';
test('unclosed tags are reported with a line number',()=>{
 const p=computeDiagnostics('index.html','<html>\n<body>\n<div>\n<p>ok</p>\n</body></html>');
 assert.ok(p.some(x=>/Missing closing tag <\/div>/.test(x.message)&&x.line===3),JSON.stringify(p));});
test('clean files and unknown types give no problems',()=>{
 assert.deepEqual(computeDiagnostics('a.html','<p>hi</p>'),[]);assert.deepEqual(computeDiagnostics('a.png','<div>'),[]);});
test('project problems list errors before warnings',()=>{
 const p=projectProblems({'a.html':'<div>','b.css':'a{color:red;'});assert.ok(p.length>0);});
test('missing stylesheet and script references are reported, existing and external ones are not',()=>{
 const files={'index.html':'<html><head>\n<link rel="stylesheet" href="css/missing.css">\n<link rel="stylesheet" href="styles.css">\n<link rel="stylesheet" href="https://cdn.example/x.css">\n<script src="app.js"></script></head><body></body></html>','styles.css':'a{}'};
 const p=referenceProblems(files);assert.deepEqual(p.map(x=>x.message),['Stylesheet not found in the project: css/missing.css','Script not found in the project: app.js']);assert.equal(p[0].line,2);});
