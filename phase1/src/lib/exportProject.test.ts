import test from 'node:test';
import assert from 'node:assert/strict';
import {inlineHtml} from './exportProject';
const files={'index.html':'<html><head><link rel="stylesheet" href="css/a.css"><link rel="icon" href="x.png"><script src="app.js"></script><script src="https://cdn/x.js"></script></head></html>','css/a.css':'p{color:red}','app.js':'alert(1)'};
test('inlines local stylesheet and script, leaves remote and other links',()=>{const out=inlineHtml(files,'index.html',{css:true,js:true});assert.match(out,/<style>\np\{color:red\}/);assert.match(out,/<script>\nalert\(1\)/);assert.match(out,/https:\/\/cdn\/x\.js/);assert.match(out,/rel="icon"/);});
test('options switch inlining off',()=>{const out=inlineHtml(files,'index.html',{css:false,js:false});assert.equal(out,files['index.html']);});
test('relative paths resolve from the html folder',()=>{const out=inlineHtml({'pages/p.html':'<link rel="stylesheet" href="../s.css">','s.css':'b{}'},'pages/p.html',{css:true,js:false});assert.match(out,/<style>/);});
