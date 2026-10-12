import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeResourceBytes,flattenCssImports,loadPreviewResources,mergeTextResources,resolveProjectPathStrict,scanCssRefs,scanHtmlRefs,scanJsImports,type ResourceInvoke} from './previewResources';
import {findImportSpecs,newModuleState,rewriteImports} from './previewModules';
import {collectDeps,flattenCss,planPreviewUpdate} from './previewDeps';
const b64=(s:string|Uint8Array)=>Buffer.from(s).toString('base64');
const disk=(files:Record<string,string|Uint8Array>,mimes:Record<string,string>={}):{invoke:ResourceInvoke;reads:string[]}=>{
 const reads:string[]=[];
 return{reads,invoke:async<T>(_c:string,args?:Record<string,unknown>)=>{const p=String(args?.path);reads.push(p);const f=files[p];if(f===undefined)throw {code:'not_found'};return{mime:mimes[p]??(p.endsWith('.css')?'text/css':p.endsWith('.js')||p.endsWith('.mjs')?'text/javascript':'application/octet-stream'),size:f.length,data:b64(f)} as T;}};
};
test('decodeResourceBytes handles UTF-8 BOM, UTF-16 BOMs and falls back to Windows-1252',()=>{
 assert.equal(decodeResourceBytes(Buffer.from('\uFEFFa{content:"ü"}')),'a{content:"ü"}');
 assert.equal(decodeResourceBytes(Buffer.concat([Buffer.from([0xFF,0xFE]),Buffer.from('a{b:1}','utf16le')])),'a{b:1}');
 const be=Buffer.from('a{b:1}','utf16le').swap16();assert.equal(decodeResourceBytes(Buffer.concat([Buffer.from([0xFE,0xFF]),be])),'a{b:1}');
 assert.equal(decodeResourceBytes(Uint8Array.from([0x63,0x61,0x66,0xE9])),'café');
 assert.equal(decodeResourceBytes(new Uint8Array()),'');
});
test('loader reads UTF-16 and Windows-1252 stylesheets and scripts instead of garbling them',async()=>{
 const css16=Buffer.concat([Buffer.from([0xFF,0xFE]),Buffer.from('@import "b.css";','utf16le')]);
 const {invoke}=disk({'a.css':css16,'b.css':Uint8Array.from([0x2F,0x2A,0xE9,0x2A,0x2F,0x62,0x7B,0x7D]),'m.js':Buffer.from('\uFEFFexport const x="ä";')});
 const r=await loadPreviewResources({invoke,projectId:'p',files:{'i.html':'<link rel=stylesheet href=a.css><script type=module src=m.js></script>'},active:'i.html'});
 assert.equal(r.text['a.css'],'@import "b.css";');assert.ok('b.css' in r.text,'import inside the UTF-16 sheet was followed');
 assert.equal(r.text['b.css'],'/*é*/b{}');assert.equal(r.text['m.js'],'export const x="ä";');
});
test('percent-encoded names resolve to the file on disk; encoded traversal and backslashes do not',()=>{
 assert.equal(resolveProjectPathStrict('i.html','my%20file.css'),'my file.css');
 assert.equal(resolveProjectPathStrict('a/i.html','%2e%2e/%2e%2e/x.css'),'escape');
 assert.equal(resolveProjectPathStrict('i.html','a%5Cb.css'),null);
 assert.equal(resolveProjectPathStrict('i.html','bad%ZZname.css'),'bad%ZZname.css');
 assert.equal(resolveProjectPathStrict('i.html','a%00b.css'),null);
});
test('a project of hundreds of files stops at the file limit and reports the rest, without reading them',async()=>{
 const files:Record<string,string>={};let html='';
 for(let i=0;i<400;i++){files[`i/${i}.png`]='x';html+=`<img src="i/${i}.png">`;}
 const {invoke,reads}=disk(files);
 const r=await loadPreviewResources({invoke,projectId:'p',files:{'i.html':html},active:'i.html'});
 assert.equal(reads.length,300);assert.equal(Object.keys(r.assets).length,300);
 assert.equal(r.failed.length,100);assert.ok(r.failed.every(f=>f.reason==='limit'));
});
test('a deep module chain stops at the depth limit instead of looping, a broken link in the middle does not stop siblings',async()=>{
 const files:Record<string,string>={};for(let i=0;i<20;i++)files[`m${i}.js`]=`import "./m${i+1}.js"`;
 const {invoke,reads}=disk(files);
 const r=await loadPreviewResources({invoke,projectId:'p',files:{'i.html':'<script type=module src=m0.js></script>'},active:'i.html'});
 assert.ok(reads.length<=10,`read ${reads.length}`);assert.ok(r.text['m0.js']);
 const d2=disk({'ok.css':'a{}','b.css':'@import "gone.css";@import "ok2.css";','ok2.css':'c{}'});
 const r2=await loadPreviewResources({invoke:d2.invoke,projectId:'p',files:{'i.html':'<link rel=stylesheet href=b.css><link rel=stylesheet href=ok.css>'},active:'i.html'});
 assert.deepEqual(r2.failed.map(f=>f.path),['gone.css']);assert.ok(r2.text['ok2.css']&&r2.text['ok.css']);
});
test('reload sequence: the same inputs resolve to the same result and a second load reads only what is not cached',async()=>{
 const {invoke,reads}=disk({'s.css':'a{background:url(a.png)}','a.png':'x'});
 const files={'i.html':'<link rel=stylesheet href=s.css><img src=a.png>'};
 const one=await loadPreviewResources({invoke,projectId:'p',files,active:'i.html'});
 const two=await loadPreviewResources({invoke,projectId:'p',files,active:'i.html',skip:p=>p in one.assets});
 assert.deepEqual(two.text,one.text);assert.deepEqual(two.assets,{});assert.equal(reads.filter(p=>p==='a.png').length,1);
 const gone=await loadPreviewResources({invoke:async()=>{throw {code:'not_found'};},projectId:'p',files,active:'i.html'});
 assert.deepEqual(gone.failed.map(f=>f.reason),['missing','missing']);
});
test('CSS @import with layer() or supports() is left for the browser, plain and media imports still flatten',()=>{
 const text={'a.css':'@import "b.css" layer(base);@import "c.css" supports(display:grid);@import "d.css" print;','b.css':'b{}','c.css':'c{}','d.css':'d{}'};
 const out=flattenCssImports(text['a.css'],'a.css',text);
 assert.match(out,/@import "b\.css" layer\(base\);/);assert.match(out,/@import "c\.css" supports\(display:grid\);/);assert.match(out,/@media print\{d\{\}\}/);
 const css=flattenCss(text,'a.css');assert.match(css,/@import "b\.css" layer\(base\);/);assert.match(css,/@media print\{d\{\}\}/);
 assert.ok(!mergeTextResources({'a.css':text['a.css'],'b.css':'b{}'},{text:{},assets:{},failed:[]})['a.css'].includes('@media layer'));
});
test('CSS scanning copes with odd input: unterminated comments, empty url(), nested quotes, uppercase URL()',()=>{
 assert.deepEqual(scanCssRefs('a{background:URL( "x y.png" )}b{background:url()}/* unterminated url(z.png)'),[{href:'x y.png',kind:'asset'}]);
 assert.deepEqual(scanCssRefs('@IMPORT url("a.css");'),[{href:'a.css',kind:'css'}]);
 assert.deepEqual(scanCssRefs(''),[]);
});
test('HTML scanning: malformed markup, templates, uppercase tags and duplicate references',()=>{
 const html='<IMG SRC="a.png"><img src="a.png"><template><img src="t.png"></template><div <img src="broken.png"><link rel="stylesheet" href="">';
 const {refs}=scanHtmlRefs(html,'i.html');const paths=refs.map(r=>r.path);
 assert.ok(paths.includes('a.png')&&paths.includes('t.png'));assert.equal(paths.filter(p=>p==='a.png').length,1);
 assert.deepEqual(scanHtmlRefs('','i.html'),{refs:[],escaped:[]});
 assert.deepEqual(scanHtmlRefs('<img src="../../x.png">','a/i.html').escaped,['../../x.png']);
});
test('module specifiers: export lists without from, import.meta, strings and regex-like text are not rewritten',()=>{
 const js=`export {a,b};\nconst u=import.meta.url;\nconst s="import x from './fake.js'";\nimport d from './real.js';`;
 const specs=findImportSpecs(js).map(s=>s.spec);
 assert.ok(specs.includes('./real.js'));assert.equal(scanJsImports(js).includes('./real.js'),true);
 const text=js.replace(/\r\n?/g,'\n');const out=rewriteImports({'real.js':'export default 1','m.js':text},'m.js',text,newModuleState());
 assert.match(out,/import d from 'data:text\/javascript/);assert.match(out,/export \{a,b\};/);
});
test('module linking: CRLF sources keep one line per line, a diamond shares one URL, a missing leaf leaves the import as written',()=>{
 const files={'a.js':"import './b.js';\r\nimport './c.js';\r\nimport './gone.js';",'b.js':"import './d.js';",'c.js':"import './d.js';",'d.js':'export const d=1;'};
 const st=newModuleState();const out=rewriteImports(files,'a.js',files['a.js'].replace(/\r\n?/g,'\n'),st);
 const urls=[...out.matchAll(/'(data:[^']+)'/g)].map(m=>m[1]);assert.equal(urls.length,2);assert.match(out,/'\.\/gone\.js'/);
 assert.equal(st.urls.size,3);assert.deepEqual(st.cycles,[]);
 const dec=(u:string)=>Buffer.from(u.slice(u.indexOf(',')+1),'base64').toString();
 const dOf=(u:string)=>dec(u).match(/'(data:[^']+)'/)![1];assert.equal(dOf(urls[0]),dOf(urls[1]));
});
test('plan: deleting or adding a linked module or stylesheet rebuilds, editing an unrelated html does not',()=>{
 const base={'index.html':'<link rel=stylesheet href=a.css><script type=module src=m.js></script>','a.css':'a{}','m.js':'import "./x.js"','x.js':'1'};
 const s=(f:Record<string,string>)=>({files:f,active:'index.html'});
 const {['x.js']:_x,...noX}=base;assert.deepEqual(planPreviewUpdate(s(base),s(noX)),{kind:'full'});
 const {['a.css']:_a,...noCss}=base;assert.deepEqual(planPreviewUpdate(s(base),s(noCss)),{kind:'full'});
 assert.deepEqual(planPreviewUpdate(s(base),s({...base,'other.html':'<p>x</p>'})),{kind:'none'});
 assert.deepEqual(planPreviewUpdate(s(base),s({...base,'a.css':'a{color:red}'})),{kind:'css',paths:['a.css']});
 assert.deepEqual(collectDeps({'index.html':'<link rel=stylesheet href="my%20file.css">','my file.css':'a{}'},'index.html').linkedCss,['my file.css']);
});
