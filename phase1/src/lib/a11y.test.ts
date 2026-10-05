import test from 'node:test';
import assert from 'node:assert/strict';
import {parseColor,contrastRatio,contrastProblems,contentProblems,a11yProblems} from './a11y';
import {projectProblems} from './diagnostics';
test('contrast ratio matches WCAG reference values',()=>{
 assert.equal(contrastRatio([0,0,0],[255,255,255]).toFixed(1),'21.0');
 assert.equal(contrastRatio([119,119,119],[255,255,255]).toFixed(2),'4.48');});
test('colour parsing: hex, rgb, names; unsure values give null',()=>{
 assert.deepEqual(parseColor('#fff'),[255,255,255]);assert.deepEqual(parseColor('rgb(1, 2, 3)'),[1,2,3]);assert.deepEqual(parseColor('Navy'),[0,0,128]);
 assert.equal(parseColor('rgba(0,0,0,.5)'),null);assert.equal(parseColor('var(--x)'),null);});
test('low contrast from inline style and from a class rule is flagged, good contrast is not',()=>{
 const files={'a.html':'<html><head><style>.muted{color:#999}</style></head><body>\n<p style="color:#777">x</p>\n<p class="muted">y</p>\n<p style="color:#000">ok</p></body></html>'};
 const p=contrastProblems(files);assert.equal(p.length,2,JSON.stringify(p));assert.equal(p[0].line,2);assert.match(p[0].message,/4\.48:1, needs 4\.5:1/);});
test('large text only needs 3:1, unknown colours are skipped',()=>{
 assert.equal(contrastProblems({'a.html':'<h1 style="color:#777;font-size:32px">x</h1>'}).length,0);
 assert.equal(contrastProblems({'a.html':'<p style="color:var(--c);background:linear-gradient(red,blue)">x</p>'}).length,0);});
test('linked css files and body background are used',()=>{
 const p=contrastProblems({'a.html':'<body><p class="t">x</p></body>','s.css':'body{background:#000}.t{color:#222}'});assert.equal(p.length,1);});
test('weak alt text, image inputs, empty headings, first heading',()=>{
 const m=contentProblems({'a.html':'<html lang="en"><body><h2></h2><img src="a.png" alt="photo.png"><img src="b.png" alt="Image of a cat"><input type="image" src="x.png"><img src="c.png" alt="A red bike"></body></html>'}).map(x=>x.message);
 assert.equal(m.length,5,JSON.stringify(m));});
test('projectProblems includes the new checks and stays clean for good pages',()=>{
 assert.ok(projectProblems({'a.html':'<html lang="en"><head><title>T</title></head><body><h1>x</h1><p style="color:#aaa">y</p></body></html>'}).some(x=>/contrast/.test(x.message)));
 assert.deepEqual(a11yProblems({'a.html':'<html lang="en"><head><title>T</title></head><body><h1>x</h1><p style="color:#222">y</p><img src="a.png" alt="A red bike"></body></html>'}),[]);});
