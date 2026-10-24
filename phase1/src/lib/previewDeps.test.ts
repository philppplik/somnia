import test from 'node:test';
import assert from 'node:assert/strict';
import {collectDeps,flattenCss,planPreviewUpdate,scanCss} from './previewDeps';
import {inlineCssAssets,resolveProjectPath as resolveRef} from './previewAssets';
import {PreviewAssetWatch,fingerprint} from './previewAssetWatch';
import {PreviewAssetCache} from './previewAssetCache';
const page='<!doctype html><html><head><link rel="stylesheet" href="css/site.css"><link rel="icon" href="fav.png"><style>.x{background:url(img/inline.png)}</style><script src="js/app.js"></script></head><body><img src="img/a.png" srcset="img/a@2x.png 2x, img/a@3x.png 3x"><div style="background:url(\'img/s.webp\')"></div><a href="other.html">x</a></body></html>';
const files={'index.html':page,'css/site.css':'@import "base.css";\n@import url(theme/dark.css) screen;\nbody{background:url(../img/bg.jpg)} @font-face{font-family:F;src:url(../fonts/f.woff2) format("woff2"),url("https://cdn.test/x.woff")}','css/base.css':'/* url(nope.png) */ h1{color:red}@import "site.css";','css/theme/dark.css':'a{color:blue}','js/app.js':'1'};
test('resolveRef handles relative, parent and non-project references',()=>{
 assert.equal(resolveRef('css/site.css','../img/a.png'),'img/a.png');
 assert.equal(resolveRef('nested/index.html','/a.css'),'a.css');
 assert.equal(resolveRef('index.html','./a/b.css?v=2#x'),'a/b.css');
 for(const r of ['https://x.test/a.css','//x.test/a.css','data:image/png;base64,AA','#top',''])assert.equal(resolveRef('index.html',r),null);
});
test('collectDeps walks html, css imports (cycle-safe), url() and srcset',()=>{
 const d=collectDeps(files,'index.html');
 assert.deepEqual(d.linkedCss,['css/site.css']);
 assert.deepEqual([...d.css].sort(),['css/base.css','css/site.css','css/theme/dark.css']);
 assert.deepEqual(d.js,['js/app.js']);
 assert.deepEqual([...d.assets].sort(),['css/img/bg.jpg'.replace('css/',''),'fav.png','fonts/f.woff2','img/a.png','img/a@2x.png','img/a@3x.png','img/inline.png','img/s.webp'].sort());
 assert.ok(d.all.includes('index.html')&&!d.all.includes('other.html'));
});
test('scanCss ignores comments and remote urls',()=>{
 const s=scanCss(files['css/base.css'],'css/base.css');assert.deepEqual(s,{imports:['css/site.css'],assets:[]});
});
test('flattenCss inlines imports, wraps media imports and rewrites known asset urls',()=>{
 const css=flattenCss(files,'css/site.css',(t,at)=>inlineCssAssets(t,at,new Map([['img/bg.jpg','data:image/jpeg;base64,AA']]),{refs:new Set()}));
 assert.match(css,/h1\{color:red\}/);assert.match(css,/@media screen\{a\{color:blue\}\}/);assert.match(css,/url\("data:image\/jpeg;base64,AA"\)/);assert.match(css,/https:\/\/cdn\.test\/x\.woff/);
});
const state=(f:Record<string,string>)=>({files:f,active:'index.html'});
test('plan: unrelated file change does nothing',()=>{
 assert.deepEqual(planPreviewUpdate(state(files),state({...files,'notes.txt':'x','other.html':'y'})),{kind:'none'});
});
test('plan: css edit (also in an imported file) hot swaps the linked sheet',()=>{
 assert.deepEqual(planPreviewUpdate(state(files),state({...files,'css/theme/dark.css':'a{color:green}'})),{kind:'css',paths:['css/site.css']});
 assert.deepEqual(planPreviewUpdate(state(files),state({...files,'css/site.css':files['css/site.css']+'p{}'})),{kind:'css',paths:['css/site.css']});
});
test('plan: html, js and graph changes rebuild',()=>{
 assert.equal(planPreviewUpdate(state(files),state({...files,'index.html':page+' '})).kind,'full');
 assert.equal(planPreviewUpdate(state(files),state({...files,'js/app.js':'2'})).kind,'full');
 assert.equal(planPreviewUpdate(state(files),state({...files,'css/base.css':'@import "new.css";'})).kind,'full');
 const {'css/theme/dark.css':_,...gone}=files;assert.equal(planPreviewUpdate(state(files),state(gone)).kind,'full');
 assert.equal(planPreviewUpdate(state(files),{...state(files),active:'other.html'}).kind,'full');
});
test('plan: css in a file the page does not link is ignored',()=>{
 assert.deepEqual(planPreviewUpdate(state(files),state({...files,'css/unused.css':'a{}'})),{kind:'none'});
});
const png=(n:number)=>({bytes:new Uint8Array([n,n,n])});
test('asset watch: records first, reports changed, vanished and newly appeared files',async()=>{
 const disk=new Map<string,ReturnType<typeof png>|null>([['img/a.png',png(1)],['img/gone.png',png(2)]]);
 const load=async(p:string)=>disk.get(p)??null;
 const cache=new PreviewAssetCache();await cache.ensure(['img/a.png','img/gone.png','img/new.png'],load);
 const w=new PreviewAssetWatch();
 assert.deepEqual(await w.check(cache,load),[]);
 assert.deepEqual(await w.check(cache,load),[]);
 disk.set('img/a.png',png(9));disk.set('img/gone.png',null);disk.set('img/new.png',png(3));
 assert.deepEqual((await w.check(cache,load)).sort(),['img/a.png','img/gone.png','img/new.png']);
 assert.notEqual(fingerprint(png(1)),fingerprint(png(2)));
});
