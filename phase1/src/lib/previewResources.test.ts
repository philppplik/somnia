import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPreviewResources,mergeTextResources,parseSrcset,resolveProjectPath,resolveProjectPathStrict,scanCssRefs,scanHtmlRefs,scanJsImports,type ResourceInvoke} from './previewResources';
const b64=(s:string|Uint8Array)=>Buffer.from(s).toString('base64');
const disk=(files:Record<string,string|Uint8Array>,mimes:Record<string,string>={}):{invoke:ResourceInvoke;reads:string[]}=>{const reads:string[]=[];return{reads,invoke:async<T>(command:string,args?:Record<string,unknown>)=>{assert.equal(command,'read_project_resource');const p=String(args?.path);reads.push(p);if(!(p in files))throw {code:'not_found',message:'missing'};const f=files[p];const mime=mimes[p]??(p.endsWith('.css')?'text/css':p.endsWith('.js')||p.endsWith('.mjs')?'text/javascript':p.endsWith('.png')?'image/png':'application/octet-stream');return{mime,size:Buffer.byteLength(f),data:b64(f)} as T;}};};
test('resolveProjectPath folds dots, treats / as project root and rejects external or escaping paths',()=>{
 assert.equal(resolveProjectPath('pages/a.html','../css/x.css?v=1#h'),'css/x.css');
 assert.equal(resolveProjectPath('pages/a.html','/img/a%20b.png'),'img/a b.png');
 assert.equal(resolveProjectPath('a.html','./b.css'),'b.css');
 for(const h of ['https://x/y.css','//cdn/x.js','data:image/png;base64,AA','#top','','mailto:a@b','blob:x'])assert.equal(resolveProjectPath('a.html',h),null);
 assert.equal(resolveProjectPathStrict('a.html','../secret.css'),'escape');
 assert.equal(resolveProjectPathStrict('a/b.html','../../x.css'),'escape');
 assert.equal(resolveProjectPath('a.html','..\\x.css'),null);
});
test('parseSrcset reads every candidate URL and skips data URLs',()=>{assert.deepEqual(parseSrcset('a.png 1x, b.png 2x,c.png 480w'),['a.png','b.png','c.png']);assert.deepEqual(parseSrcset('data:image/png;base64,AAAA 1x, d.png 2x'),['d.png']);});
test('scanCssRefs finds @import and url() in all quote styles, ignoring comments and data URLs',()=>{
 const r=scanCssRefs('/* url(no.png) */ @import "a.css"; @import url(b.css) screen; @import url("c.css"); .x{background:url( \'i.png\' ),url(j.png);mask:url(data:image/svg+xml;utf8,<svg/>)} @font-face{src:url(f.woff2)}');
 assert.deepEqual(r.filter(x=>x.kind==='css').map(x=>x.href),['a.css','b.css','c.css']);
 assert.deepEqual(r.filter(x=>x.kind==='asset').map(x=>x.href).filter(h=>!h.startsWith('data:')),['i.png','j.png','f.woff2']);
});
test('scanJsImports finds relative static, re-export and dynamic imports only',()=>{
 const js=`import a from './a.js';import {b} from "../b.js";import './side.js';export * from './re.js';export {x} from './x.js';const m=await import('./lazy.js');import c from 'bare-pkg';import d from 'https://x/y.js';// import e from './comment.js'\n/* import f from './c2.js' */`;
 assert.deepEqual(scanJsImports(js).sort(),['../b.js','./a.js','./lazy.js','./re.js','./side.js','./x.js']);
});
test('scanHtmlRefs covers link, script, media, srcset, style, inline style and module imports',()=>{
 const html=`<!doctype html><html><head><link rel="stylesheet" href="css/a.css"><link rel="icon" href="/favicon.ico"><link rel="preload" as="style" href="p.css"><link rel="preload" as="font" href="f.woff2"><link rel="canonical" href="x.html"><link rel="stylesheet" href="https://cdn/x.css"><script src="js/app.js"></script><script type="module" src="js/m.mjs"></script><script type="module">import './inline.js'</script><style>@import 'i.css';.h{background:url(hero.jpg)}</style></head><body style="background:url(bg.png)"><img src="a.png" srcset="a1.png 1x, a2.png 2x"><picture><source srcset="s.webp"></picture><video src="v.mp4" poster="p.jpg"><track src="t.vtt"></video><audio src="s.mp3"></audio><a href="other.html">x</a><template><img src="tpl.png"></template></body></html>`;
 const {refs}=scanHtmlRefs(html,'index.html');const by=(k:string)=>refs.filter(r=>r.kind===k).map(r=>r.path);
 assert.deepEqual(by('css'),['css/a.css','p.css','i.css']);
 assert.deepEqual(by('script'),['js/app.js']);
 assert.deepEqual(by('module'),['js/m.mjs','inline.js']);
 assert.deepEqual(by('asset').sort(),['a.png','a1.png','a2.png','bg.png','f.woff2','favicon.ico','hero.jpg','p.jpg','s.mp3','s.webp','t.vtt','tpl.png','v.mp4'].sort());
 assert.ok(!refs.some(r=>r.path==='other.html'||r.path==='x.html'));
});
test('loader loads unopened files recursively through CSS and module imports, with editor text winning',async()=>{
 const {invoke,reads}=disk({'css/a.css':'@import "b.css";.x{background:url(../img/bg.png)}','css/b.css':'@font-face{src:url(../fonts/f.woff2)}','js/m.mjs':'import "./dep.mjs"','js/dep.mjs':'export const d=1','js/app.js':'import "./nope.js"','img/bg.png':new Uint8Array([137,80,78,71]),'fonts/f.woff2':new Uint8Array([1,2]),'logo.svg':'<svg/>'},{'fonts/f.woff2':'font/woff2','logo.svg':'image/svg+xml'});
 const files={'index.html':'<link rel=stylesheet href=css/a.css><script src=js/app.js></script><script type=module src=js/m.mjs></script><img src=logo.svg><img src=gone.png>','js/app.js':'EDITOR TEXT'};
 const r=await loadPreviewResources({invoke,projectId:'p',files,active:'index.html'});
 assert.equal(r.text['css/a.css'].includes('b.css'),true);assert.ok(r.text['css/b.css']);assert.equal(r.text['js/dep.mjs'],'export const d=1');
 assert.equal(r.text['js/app.js'],'EDITOR TEXT');assert.ok(!reads.includes('js/app.js'),'open file is not read from disk');
 assert.ok(r.assets['img/bg.png'].dataUrl.startsWith('data:image/png;base64,'));assert.equal(r.assets['fonts/f.woff2'].mime,'font/woff2');assert.equal(r.text['logo.svg'],'<svg/>');assert.ok(r.assets['logo.svg']);
 assert.deepEqual(r.failed.map(f=>[f.path,f.reason]),[['gone.png','missing']]);
 assert.equal(mergeTextResources(files,r)['js/app.js'],'EDITOR TEXT');assert.ok(mergeTextResources(files,r)['css/b.css']);
});
test('loader reports escapes, survives cycles and honours file and byte limits',async()=>{
 const {invoke,reads}=disk({'a.css':'@import "b.css"','b.css':'@import "a.css"','1.png':new Uint8Array(10),'2.png':new Uint8Array(10),'3.png':new Uint8Array(10)});
 const html='<link rel=stylesheet href=a.css><link rel=stylesheet href=../outside.css><img src=1.png><img src=2.png><img src=3.png>';
 const r=await loadPreviewResources({invoke,projectId:'p',files:{'x.html':html},active:'x.html'});
 assert.ok(r.failed.some(f=>f.reason==='outside-project'));assert.equal(reads.filter(p=>p==='a.css').length,1);assert.ok(r.text['b.css']);
 const lim=await loadPreviewResources({invoke,projectId:'p',files:{'x.html':html},active:'x.html',maxFiles:2});
 assert.ok(lim.failed.some(f=>f.reason==='limit'));
 const bytes=await loadPreviewResources({invoke,projectId:'p',files:{'x.html':'<img src=1.png><img src=2.png><img src=3.png>'},active:'x.html',maxTotalBytes:15});
 assert.ok(Object.keys(bytes.assets).length<3&&bytes.failed.some(f=>f.reason==='limit'));
});
test('loader stops on abort and returns what it has; no HTML means nothing to load',async()=>{
 const c=new AbortController();c.abort();const {invoke,reads}=disk({'a.css':''});
 assert.deepEqual((await loadPreviewResources({invoke,projectId:'p',files:{'x.html':'<link rel=stylesheet href=a.css>'},active:'x.html',signal:c.signal})).text,{});assert.equal(reads.length,0);
 assert.deepEqual((await loadPreviewResources({invoke,projectId:'p',files:{},active:'x.html'})).failed,[]);
});
