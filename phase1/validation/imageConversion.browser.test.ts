/** Real browser codecs and pixels, run with tsx --test, not Vitest or mocked Canvas. */
import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';
import type {Browser,Page} from '@playwright/test';
let browser:Browser,page:Page;
const port=1437;
let server:ReturnType<typeof spawn>;
before(async()=>{
 server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port)],{stdio:'ignore'});
 for(let i=0;i<120;i++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 page=await browser.newPage({viewport:{width:1440,height:900}});
 // tsx preserves function names with this helper; page.evaluate runs outside Node.
 await page.addInitScript('window.__name = (fn) => fn');await page.goto(`http://127.0.0.1:${port}`);
});
after(async()=>{await browser?.close();server?.kill();});
test('SVG to PNG and every PNG/JPEG/WebP pair use real encoders and preserve pixel dimensions',async()=>{
 const results=await page.evaluate(async()=>{
  const {convertImage}=await import('/src/lib/imageConversion.ts');
  const svg=new Blob(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 4"><rect width="4" height="4" fill="red"/></svg>'],{type:'image/svg+xml'});
  const first=await convertImage(svg,'logo.svg',{format:'png',width:80,height:40});
  async function inspect(blob:Blob){const bitmap=await createImageBitmap(blob);const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d')!;ctx.drawImage(bitmap,0,0);bitmap.close();return {width:c.width,height:c.height,left:Array.from(ctx.getImageData(10,10,1,1).data),right:Array.from(ctx.getImageData(c.width-5,10,1,1).data)};}
  const firstPixels=await inspect(first.blob);const pairs=[];
  for(const source of ['png','jpeg','webp'] as const){const input=await convertImage(first.blob,'source.png',{format:source});for(const target of ['png','jpeg','webp'] as const){const out=await convertImage(input.blob,`image.${source}`,{format:target,width:60,height:30,quality:1});pairs.push({source,target,type:out.blob.type,name:out.filename,...await inspect(out.blob),header:Array.from(new Uint8Array(await out.blob.slice(0,12).arrayBuffer()))});}}
  const jpg=await convertImage(first.blob,'transparent.png',{format:'jpeg',quality:1});const derived=await convertImage(first.blob,'image.png',{format:'png',width:40});
  return{firstPixels,pairs,jpg:await inspect(jpg.blob),derived:{width:derived.width,height:derived.height}};
 });
 assert.deepEqual(results.firstPixels,{width:80,height:40,left:[255,0,0,255],right:[0,0,0,0]});
 assert.deepEqual(results.derived,{width:40,height:20});assert.ok(results.jpg.right.slice(0,3).every(n=>n>245));assert.equal(results.jpg.right[3],255);
 assert.equal(results.pairs.length,9);
 for(const p of results.pairs){assert.equal(p.width,60);assert.equal(p.height,30);assert.equal(p.type,`image/${p.target}`);assert.ok(p.left[0]>230&&p.left[1]<20&&p.left[2]<20);if(p.target==='png')assert.deepEqual(p.header.slice(0,8),[137,80,78,71,13,10,26,10]);if(p.target==='jpeg')assert.deepEqual(p.header.slice(0,3),[255,216,255]);if(p.target==='webp')assert.equal(String.fromCharCode(...p.header.slice(8,12)),'WEBP');}
});
test('unsafe/malformed SVG, corrupt raster, zero sizes, invalid quality and MIME fallback fail honestly',async()=>{
 const errors=await page.evaluate(async()=>{
  const {convertImage,standaloneSvg}=await import('/src/lib/imageConversion.ts');const errors:string[]=[];
  for(const xml of ['<svg/>','<svg xmlns="http://www.w3.org/2000/svg"><bad></svg>','<!DOCTYPE svg><svg/>','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5 5"><image href="https://example.com/a.png"/></svg>','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5 5"><script>alert(1)</script></svg>','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5 5" onload="alert(1)"/>','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5 5"><style>@import "https://example.com/a.css";</style></svg>']){try{standaloneSvg(xml);errors.push('NO ERROR');}catch(e){errors.push(String(e));}}
  const valid=new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="blue"/></svg>']);
  for(const opts of [{format:'png',width:0},{format:'png',quality:2},{format:'webp',width:8192,height:8192}]){try{await convertImage(valid,'a.svg',opts as any);errors.push('NO ERROR');}catch(e){errors.push(String(e));}}
  try{await convertImage(new Blob([Uint8Array.from([137,80,78,71,13,10,26,10])]),'bad.png',{format:'png'});errors.push('NO ERROR');}catch(e){errors.push(String(e));}
  const original=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(callback){return original.call(this,callback,'image/png');};
  try{await convertImage(valid,'a.svg',{format:'webp'});errors.push('NO ERROR');}catch(e){errors.push(String(e));}finally{HTMLCanvasElement.prototype.toBlob=original;}
  const local=standaloneSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 20"><defs><linearGradient id="a"><stop stop-color="red"/></linearGradient></defs><rect width="10" height="20" fill="url(#a)"/></svg>');
  if(local.size.width!==10||local.size.height!==20)errors.push('NO ERROR');
  return errors;
 });
 assert.equal(errors.length,12);assert.ok(errors.every(x=>x!=='NO ERROR'));assert.match(errors.at(-1)!,/encoding is not supported/);
});
test('Tools dialog provides resize, preview and a downloaded real PNG without touching the project',async()=>{
 const beforeProject=await page.evaluate(async()=>{const {getState}=await import('/src/store/appStore.ts');return JSON.stringify(getState().files);});
 await page.getByRole('button',{name:'Tools',exact:true}).click();await page.getByRole('menuitem',{name:'Convert image...'}).click();
 await page.getByLabel('Source image').setInputFiles({name:'sample.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100" fill="#7c3aed"/><circle cx="150" cy="50" r="30" fill="#fafafa"/></svg>')});
 await page.getByLabel('Width (px)').fill('600');assert.equal(await page.getByLabel('Height (px)').inputValue(),'300');
 await page.getByRole('button',{name:'Convert',exact:true}).click();await page.getByRole('img',{name:'Converted image preview'}).waitFor();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download',exact:true}).click();const out=await download;assert.equal(out.suggestedFilename(),'sample.png');await out.saveAs('/tmp/image-conversion-output.png');
 await page.screenshot({path:'/tmp/image-conversion-ui.png'});
 assert.equal(await page.evaluate(async()=>{const {getState}=await import('/src/store/appStore.ts');return JSON.stringify(getState().files);}),beforeProject);
 await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});
 await page.screenshot({path:'/tmp/image-conversion-dark.png'});
});
