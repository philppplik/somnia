import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assetType,resolveProjectPath,rewriteCssUrls,rewriteSrcset,inlineCssAssets,PREVIEW_ASSET_CSP} from './previewAssets';
import {PreviewAssetCache,KIND_LIMIT,describeSkipped} from './previewAssetCache';
test('resolves relative paths and rejects escapes, schemes and absolute refs',()=>{
 assert.equal(resolveProjectPath('pages/a.html','../img/my%20pic.png?x=1#y'),'img/my pic.png');
 assert.equal(resolveProjectPath('index.html','./a/./b.png'),'a/b.png');
 for(const h of ['https://x.test/a.png','//x.test/a.png','/a.png','data:image/png;base64,AA','#x','','../../a.png'])assert.equal(resolveProjectPath('a/b.html',h),null,h);
});
test('allow-list by extension decides kind and mime',()=>{
 assert.deepEqual(assetType('a/B.JPG'),{mime:'image/jpeg',kind:'image'});
 assert.equal(assetType('f.woff2')?.kind,'font');assert.equal(assetType('v.webm')?.kind,'media');
 for(const p of ['a.html','a.js','a.css','a.exe','noext'])assert.equal(assetType(p),null,p);
});
test('css url() forms and srcset are rewritten, others left alone',()=>{
 const m=(r:string)=>r.startsWith('img/')?'data:x':null;
 assert.equal(rewriteCssUrls('a{background:url(img/a.png)}b{background:url( "img/b.png" )}c{background:url(http://x/c.png)}',m),'a{background:url("data:x")}b{background:url("data:x")}c{background:url(http://x/c.png)}');
 assert.equal(rewriteSrcset('img/a.png 1x, img/b.png 2x, other.png 3x',m),'data:x 1x, data:x 2x, other.png 3x');
});
test('linked css resolves against its own folder and reports missing refs',()=>{
 const refs=new Set<string>();const have=new Map([['css/fonts/a.woff2','data:font']]);
 const out=inlineCssAssets('@font-face{src:url(fonts/a.woff2)}b{background:url(../img/x.png)}','css/site.css',have,{refs});
 assert.ok(out.includes('url("data:font")'));assert.deepEqual([...refs],['img/x.png']);
});
test('csp allows only data and blob for img, font and media',()=>{
 assert.equal(PREVIEW_ASSET_CSP,'img-src data: blob:; font-src data:; media-src data:');
});
test('cache loads once, always data:, accepts resolver data URLs, enforces limits, invalidates',async()=>{
 const cache=new PreviewAssetCache();let calls=0;
 const files:Record<string,Uint8Array>={'a.png':new Uint8Array([1,2,3]),'big.mp4':new Uint8Array(KIND_LIMIT.media+1)};
 const load=async(p:string)=>{calls++;return p==='r.jpeg'?{dataUrl:'data:image/jpg;base64,AQID'}:files[p]?{bytes:files[p]}:null;};
 assert.equal(await cache.ensure(['a.png','big.mp4','nope.png','a.png','x.exe','r.jpeg'],load),true);
 assert.equal(calls,4);assert.equal(cache.urls.get('r.jpeg'),'data:image/jpeg;base64,AQID');
 assert.equal(cache.urls.get('a.png'),'data:image/png;base64,AQID');
 assert.deepEqual(cache.skippedAssets.map(describeSkipped).sort(),['big.mp4 (too large)','nope.png (not found)','x.exe (unsupported type)']);
 assert.equal(await cache.ensure(['a.png','big.mp4','nope.png'],load),false);assert.equal(calls,4);
 cache.invalidate(['a.png']);assert.equal(cache.urls.has('a.png'),false);
 assert.equal(await cache.ensure(['a.png'],load),true);assert.equal(calls,5);
 cache.prune(new Set(['a.png']));assert.equal(cache.urls.has('r.jpeg'),false);
 cache.invalidateAll();assert.equal(cache.size,0);
});
test('late results from before invalidateAll are discarded',async()=>{
 const cache=new PreviewAssetCache();let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
 const p=cache.ensure(['a.png'],async()=>{await gate;return {bytes:new Uint8Array([1])};});
 cache.invalidateAll();release();assert.equal(await p,false);assert.equal(cache.urls.size,0);
});
