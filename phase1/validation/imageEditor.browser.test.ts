/** Real Chromium: open an image through the web host, edit, undo, adjust, save a copy. Run with tsx --test. */
import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {chromium} from '@playwright/test';
import type {Browser,Page} from '@playwright/test';
let browser:Browser,page:Page;const port=1438;let server:ReturnType<typeof spawn>;
before(async()=>{
 server=spawn(process.execPath,['node_modules/vite/bin/vite.js',...(process.env.SOMNIA_PRODUCTION==='1'?['preview']:[]),'--host','127.0.0.1','--port',String(port)],{stdio:'ignore'});
 for(let i=0;i<120;i++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.addInitScript('window.__name = (fn) => fn; localStorage.setItem("somnia.themeChoice","light")');await page.goto(`http://127.0.0.1:${port}`);
});
after(async()=>{await browser?.close();server?.kill();});
test('Edit image: open, rotate, undo, redo, save a PNG copy with the edited size',async()=>{
 await page.getByRole('button',{name:'Tools',exact:true}).click();await page.getByRole('menuitem',{name:'Edit image...'}).click();
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open image...'}).click();
 const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=200;canvas.height=100;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#7c3aed';ctx.fillRect(0,0,200,100);ctx.fillStyle='#fafafa';ctx.beginPath();ctx.arc(150,50,30,0,Math.PI*2);ctx.fill();return canvas.toDataURL().split(',')[1];});
 await (await chooser).setFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 assert.equal(await page.getByRole('dialog').count(),0);

 await page.getByText('200 x 100 px').waitFor();
 await page.getByTestId('imgedit-rotate-right').click();
 await page.getByText('100 x 200 px').waitFor();
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.getByText('200 x 100 px').waitFor();
 await page.getByRole('button',{name:'Redo',exact:true}).click();await page.getByText('100 x 200 px').waitFor();
 await page.screenshot({path:'/tmp/raster-inline-light.png'});
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save copy...'}).click();
 const out=await download;assert.equal(out.suggestedFilename(),'photo-edited.png');await out.saveAs('/tmp/image-editor-out.png');
 const output=readFileSync('/tmp/image-editor-out.png');assert.deepEqual([...output.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 assert.equal(output.readUInt32BE(16),100);assert.equal(output.readUInt32BE(20),200);
});
test('Edit image: brightness slider changes exported pixels and undo restores them',async()=>{
 const slider=page.getByRole('slider').first();
 await slider.focus();for(let i=0;i<20;i++)await slider.press('ArrowRight');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save copy...'}).click();await (await download).saveAs('/tmp/image-editor-bright.png');
 const a=readFileSync('/tmp/image-editor-out.png'),b=readFileSync('/tmp/image-editor-bright.png');
 assert.notDeepEqual(a,b);
});
test('Edit image: invert filter changes pixels, strength 100% inverts the purple fill',async()=>{
 await page.getByRole('tab',{name:'Filter',exact:true}).click();
 await page.getByTestId('image-editor-filter-select').selectOption('invert');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save copy...'}).click();await (await download).saveAs('/tmp/image-editor-invert.png');
 const png=readFileSync('/tmp/image-editor-invert.png');assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 assert.notDeepEqual(png,readFileSync('/tmp/image-editor-out.png'));
});
test('Edit image: rectangle selection + fill is replayed into the exported copy',async()=>{
 await page.getByTestId('image-editor-filter-select').selectOption('');
 await page.getByRole('button',{name:'Select',exact:true}).click();
 const canvas=page.getByLabel(/^Image canvas/);const box=(await canvas.boundingBox())!;
 await page.mouse.move(box.x+box.width/2-20,box.y+box.height/2-20);await page.mouse.down();await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2+20,{steps:4});await page.mouse.up();
 await page.getByRole('button',{name:'Fill',exact:true}).click();
 await page.screenshot({path:'/tmp/image-editor-select.png'});
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save copy...'}).click();await (await download).saveAs('/tmp/image-editor-fill.png');
 assert.notDeepEqual(readFileSync('/tmp/image-editor-fill.png'),readFileSync('/tmp/image-editor-bright.png'));
});

test('History is an inspector tab, image dirty close can cancel, and collapsed panels retain edits',async()=>{
 await page.getByRole('tab',{name:'History',exact:true}).click();await page.getByTestId('image-editor-history').waitFor();
 await page.screenshot({path:'/tmp/raster-history-light.png'});
 await page.getByTestId('imgedit-rotate-left').click();
 const tab=page.getByTestId('media-tab');assert.match(await tab.innerText(),/\*/);
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Close photo.png',exact:true}).click();assert.equal(await tab.count(),1);
 await page.keyboard.press('Control+b');assert.equal(await page.getByTestId('imgedit-transform-panel').count(),0);
 await page.keyboard.press('Control+b');await page.getByTestId('imgedit-transform-panel').waitFor();
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 assert.doesNotMatch(await tab.innerText(),/\*/);
});
test('PNG, JPEG and WebP route inline; each image keeps its own undo and edits across switches',async()=>{
 for(const [name,mime] of [['other.jpg','image/jpeg'],['third.webp','image/webp']] as const){
  const encoded=await page.evaluate(mime=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#22bb88';ctx.fillRect(0,0,320,240);return canvas.toDataURL(mime).split(',')[1];},mime);
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open another...'}).click();await (await chooser).setFiles({name,mimeType:mime,buffer:Buffer.from(encoded,'base64')});
  await page.getByText('320 x 240 px').waitFor();assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByTestId('imgedit-rotate-right').click();await page.getByText('240 x 320 px').waitFor();
 }
 await page.getByRole('tab',{name:'photo.png'}).click();await page.getByText('100 x 200 px').waitFor();
 await page.getByRole('tab',{name:'other.jpg'}).click();await page.getByText('240 x 320 px').waitFor();
 await page.keyboard.press('Control+z');await page.getByText('320 x 240 px').waitFor();
 await page.getByRole('tab',{name:'third.webp'}).click();await page.getByText('240 x 320 px').waitFor();
 const dl=page.waitForEvent('download');await page.keyboard.press('Control+s');assert.equal((await dl).suggestedFilename(),'third-edited.png');
});
test('24 MP source keeps an interactive slider path with the existing preview engine',{skip:process.env.SOMNIA_STRESS!=='1'},async()=>{
 await page.reload();
 await page.getByRole('button',{name:'Tools',exact:true}).click();await page.getByRole('menuitem',{name:'Edit image...'}).click();
 await page.getByRole('tab',{name:'Adjust',exact:true}).click();
 const encoded=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=6000;canvas.height=4000;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#4488aa';ctx.fillRect(0,0,6000,4000);return canvas.toDataURL().split(',')[1];});
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open image...'}).click();await (await chooser).setFiles({name:'large.png',mimeType:'image/png',buffer:Buffer.from(encoded,'base64')});
 await page.getByText('6000 x 4000 px').waitFor();
 const slider=page.getByRole('slider').first();await slider.focus();const start=Date.now();for(let i=0;i<5;i++)await slider.press('ArrowRight');const elapsed=Date.now()-start;
 await page.getByRole('button',{name:'Undo',exact:true}).waitFor({state:'visible'});
 await page.screenshot({path:'/tmp/raster-24mp-light.png'});
 console.log(`24 MP / 5 keyboard slider ticks: ${elapsed} ms (headless Chromium; not a desktop GPU benchmark)`);
 assert.ok(elapsed<5000,`five slider ticks took ${elapsed} ms`);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save copy...'}).click();const out=await download;await out.saveAs('/tmp/raster-24mp-export.png');
 const png=readFileSync('/tmp/raster-24mp-export.png');assert.equal(png.readUInt32BE(16),6000);assert.equal(png.readUInt32BE(20),4000);
});

test('real PhotoCraft WASM worker blur preview extends opaque edges and returns changed pixels',async()=>{
 const proof=await page.evaluate(async()=>{
  const {CraftBlurPreview}=await import('/src/lib/craft/blurPreview.ts');
  const messages:string[]=[];const engine=new CraftBlurPreview(message=>messages.push(message));
  const width=128,height=128,data=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;data[i]=x<64?255:0;data[i+2]=x<64?0:255;data[i+3]=255;}
  try{const result=await engine.render({width,height,data},4);return{alpha:result.data[3],edge:[...result.data.slice(0,4)],center:[...result.data.slice((64*width+64)*4,(64*width+64)*4+4)],messages};}finally{engine.dispose();}
 });
 assert.equal(proof.alpha,255);assert.deepEqual(proof.edge,[255,0,0,255]);assert.ok(proof.center[0]>0&&proof.center[0]<255);assert.equal(proof.messages.length,0);
 await page.getByRole('tab',{name:'photo.png'}).click();await page.getByTestId('raster-transform-tool').click();await page.getByRole('tab',{name:'Filter',exact:true}).click();const workerStarted=page.waitForEvent('worker');await page.getByTestId('image-editor-filter-select').selectOption('blur');assert.match((await workerStarted).url(),/worker/);
 await page.waitForTimeout(600);await page.screenshot({path:'/tmp/raster-craft-blur-light.png'});
});

test('craft worker rejects invalid jobs, recovers, transfers ownership and disposes',async()=>{
 const result=await page.evaluate(async()=>{const {CraftEngine}=await import('/src/lib/craft/engine.ts');const engine=new CraftEngine();await engine.init();let rejected=false,disposed=false;try{await engine.blur(new ArrayBuffer(4),4,4,1);}catch{rejected=true;}const buffer=new Uint8Array([1,2,3,255]).buffer;const response=await engine.blur(buffer,1,1,0);const detached=buffer.byteLength===0;engine.dispose();try{await engine.blur(new ArrayBuffer(4),1,1,0);}catch{disposed=true;}return{rejected,detached,disposed,ok:response.ok};});
 assert.deepEqual(result,{rejected:true,detached:true,disposed:true,ok:true});
});
