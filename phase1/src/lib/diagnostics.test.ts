import test from 'node:test';
import assert from 'node:assert/strict';
import {computeDiagnostics,projectProblems,referenceProblems,accessibilityProblems} from './diagnostics';
import {a11yProblems} from './a11y';
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
test('accessibility checks flag missing alt, lang, title and heading jumps',()=>{
 const bad=accessibilityProblems({'a.html':'<html><head></head><body><h1>x</h1><h3>y</h3><img src="a.png"></body></html>'}).map(x=>x.message);
 assert.equal(bad.length,4,JSON.stringify(bad));
 assert.deepEqual(accessibilityProblems({'a.html':'<html lang="en"><head><title>T</title></head><body><h1>x</h1><h2>y</h2><img src="a.png" alt=""></body></html>'}),[]);});
// Regression: the text-based checks used to scan comments and script/style bodies as if they were markup, and cut tags at a ">" inside an attribute value.
const page=(body:string,head='')=>`<html lang="en"><head><title>T</title>${head}</head><body>${body}</body></html>`;
test('markup inside HTML comments is not checked',()=>{
 assert.deepEqual(accessibilityProblems({'a.html':page('<h1>x</h1><!-- <img src="a.png"><h4>old</h4> -->')}),[]);
 assert.deepEqual(accessibilityProblems({'a.html':'<!-- <html> --><div><img src="a" alt="x"></div>'}),[]);});
test('markup-like strings inside script and style are not checked',()=>{
 assert.deepEqual(accessibilityProblems({'a.html':page('<h1>x</h1><script>var s="<img src=a><h4>";</script>')}),[]);
 assert.deepEqual(a11yProblems({'a.html':page('<h1>x</h1>','<style>/* <p style="color:#fff"> */</style>')}).filter(p=>/contrast/i.test(p.message)),[]);});
test('a ">" inside an attribute value does not end the tag early',()=>{
 assert.deepEqual(accessibilityProblems({'a.html':page('<h1>x</h1><img src="a.png" data-x="a>b" alt="ok">')}),[]);});
test('commented-out and percent-encoded references are not reported missing',()=>{
 const files={'index.html':'<!-- <script src="gone.js"></script> --><script src="my%20file.js"></script>','my file.js':''};
 assert.deepEqual(referenceProblems(files),[]);});
test('real problems after a comment keep their original line and column',()=>{
 const p=accessibilityProblems({'a.html':'<!-- one\ntwo -->\n  <img src="a.png">'});
 const img=p.find(x=>/no alt/.test(x.message));assert.ok(img&&img.line===3&&img.col===3,JSON.stringify(p));});
