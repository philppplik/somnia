import test from 'node:test';import assert from 'node:assert/strict';
import {appendMediaWidth,listMediaWidths,resolveStyleBreakpoint,updateMediaWidth,validMediaWidth} from './responsiveBreakpoints';
const files={'a.css':'/* @media (max-width: 123px) {} */\n@media screen and (min-width: 500px) and (max-width: 950px) { .x {color:red} }\n@media (max-width: 768px) { .a {content:"@media (max-width: 444px) {"} }','index.html':'<style>\n@media (min-width: 1200px) {.a{display:block}}\n</style><p>unchanged</p>'};
test('lists pixel widths in external and embedded CSS, ignoring comments and strings',()=>{
 const r=listMediaWidths(files);assert.deepEqual(r.map(x=>x.width),[500,950,768,1200]);assert.equal(r[0].line,2);assert.equal(r[3].line,2);assert.equal(r[2].canScope,true);assert.equal(r[1].canScope,false);
 for(const x of r)assert.equal(files[x.file as keyof typeof files].slice(x.start,x.end),String(x.width));
});
test('updates only one numeric token and preserves HTML and complex conditions',()=>{
 const r=listMediaWidths(files);const updated=updateMediaWidth(files,r[1],'1024')!;
 assert.equal(updated,files['a.css'].replace('950px','1024px'));
 const embedded=updateMediaWidth(files,r[3],'1280')!;assert.equal(embedded,files['index.html'].replace('1200px','1280px'));
 assert.equal(updateMediaWidth({...files,'a.css':'/* changed */'+files['a.css']},r[1],'1000'),null);
});
test('bounds and integer validation reject malformed widths and injected CSS',()=>{
 for(const bad of ['','199','3841','768.5','1e3','-400','768; }','Infinity'])assert.equal(validMediaWidth(bad),false);
 assert.equal(validMediaWidth('200'),true);assert.equal(validMediaWidth('3840'),true);
 assert.equal(updateMediaWidth(files,listMediaWidths(files)[0],'0'),null);
});
test('adds empty query to selected external CSS only and prevents duplicate queries',()=>{
 const added=appendMediaWidth(files,'a.css','max','1024')!;assert.ok(added.startsWith(files['a.css']));assert.match(added,/@media \(max-width: 1024px\) \{/);
 assert.equal(appendMediaWidth(files,'a.css','max','768'),null);assert.equal(appendMediaWidth(files,'index.html','max','768'),null);assert.equal(appendMediaWidth(files,'missing.css','max','768'),null);
});
test('explicit scope is independent from preview and auto preserves legacy choices',()=>{
 assert.equal(resolveStyleBreakpoint(1280,768),768);assert.equal(resolveStyleBreakpoint(390,null),undefined);
 assert.equal(resolveStyleBreakpoint(1280,'auto'),undefined);assert.equal(resolveStyleBreakpoint(820,'auto'),900);assert.equal(resolveStyleBreakpoint(390,'auto'),600);
});
test('unsupported units and width ranges are not reinterpreted as px rules',()=>{
 assert.deepEqual(listMediaWidths({'a.css':'@media (max-width: 40em){} @media (width <= 700px){}'}),[]);
});
