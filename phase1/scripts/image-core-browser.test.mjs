import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('real decode, SVG safety, CPU export, GPU parity and viewport interaction',async()=>{
 const server=await createServer({root,server:{host:'127.0.0.1',port:0}});await server.listen();
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try {
  const page=await browser.newPage({viewport:{width:900,height:650}});await page.goto(server.resolvedUrls.local[0]);
  const result=await page.evaluate(async()=>{
   const core=await import('/src/lib/image-editor/index.ts');
   const source=document.createElement('canvas');source.width=4;source.height=4;const ctx=source.getContext('2d');
   ctx.fillStyle='#ff0000';ctx.fillRect(0,0,4,2);ctx.fillStyle='#0000ff';ctx.fillRect(0,2,4,2);
   const blob=await new Promise(resolve=>source.toBlob(resolve));const loaded=await core.loadImage(blob,'fixture.png');
   const registry=core.createOperationRegistry(),renderer=new core.ImageEditorRenderer(loaded,registry);
   const doc=core.appendOperation(loaded.document,{id:'invert',type:'raster',version:1,enabled:true,params:{edit:{op:'invert'}}});
   const cpu=await renderer.render(doc),pixels=cpu.canvas.getContext('2d').getImageData(0,0,4,4).data;
   const formats={};for(const format of ['png','jpg','webp']) {const output=await core.exportImage(renderer,doc,{format,quality:0.8});const decoded=await createImageBitmap(output);formats[format]={mime:output.type,width:decoded.width,height:decoded.height};decoded.close();const reloaded=await core.loadImage(output,`export.${format}`);if(reloaded.document.source.width!==4)throw new Error('Reload failed');reloaded.dispose();}
   let rejected=false;try{await core.loadImage(new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],{type:'image/svg+xml'}),'bad.svg');}catch{rejected=true;}
   const svg=await core.loadImage(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="8" height="6"><rect width="8" height="6" fill="lime"/></svg>'],{type:'image/svg+xml'}),'safe.svg');
   // Actual shader path, two passes verify orientation and no framebuffer feedback loops.
   registry.register({type:'gpu-invert',version:1,apply(input){const data=new Uint8ClampedArray(input.data);for(let i=0;i<data.length;i+=4){data[i]=255-data[i];data[i+1]=255-data[i+1];data[i+2]=255-data[i+2];}return {...input,data};},fragmentShader(){return '#version 300 es\nprecision highp float;uniform sampler2D uTex;in vec2 vUv;out vec4 outColor;void main(){vec4 c=texture(uTex,vUv);outColor=vec4(1.0-c.rgb,c.a);}';}});
   const gpuDoc=core.withOperations(loaded.document,[{id:'g1',type:'gpu-invert',version:1,enabled:true,params:{}},{id:'g2',type:'gpu-invert',version:1,enabled:true,params:{}}]);
   const gpu=await renderer.render(gpuDoc,{preview:true});const sample=document.createElement('canvas');sample.width=4;sample.height=4;sample.getContext('2d').drawImage(gpu.canvas,0,0);const gpuPixels=Array.from(sample.getContext('2d').getImageData(0,0,4,4).data);
   const beforeLoss=gpu.backend;
   const gl=gpu.canvas.getContext('webgl2');gl?.getExtension('WEBGL_lose_context')?.loseContext();await new Promise(r=>setTimeout(r,80));
   const afterLoss=await renderer.render(gpuDoc,{preview:true});
   // Render component itself, not a static approximation.
   const React=await import('/node_modules/.vite/deps/react.js'),ReactDOM=await import('/node_modules/.vite/deps/react-dom_client.js');
   const {ImageEditorViewport}=await import('/src/components/ImageEditorViewport.tsx');document.body.innerHTML='<div id="fixture" style="height:500px;width:800px"></div>';
   const display=document.createElement('canvas');display.width=480;display.height=320;display.getContext('2d').imageSmoothingEnabled=false;display.getContext('2d').drawImage(cpu.canvas,0,0,480,320);
   const root=(ReactDOM.default ?? ReactDOM).createRoot(document.getElementById('fixture'));
   root.render((React.default ?? React).createElement(ImageEditorViewport,{image:display,onViewportChange:v=>{window.__viewport=v;}}));
   window.__coreCleanup=()=>{root.unmount();renderer.dispose();loaded.dispose();svg.dispose();};
   return {top:Array.from(pixels.slice(0,4)),bottom:Array.from(pixels.slice(48,52)),formats,rejected,svgSize:[svg.document.source.width,svg.document.source.height],gpuPixels,beforeLoss,afterLoss:afterLoss.backend};
  });
  assert.deepEqual(result.top,[0,255,255,255]);assert.deepEqual(result.bottom,[255,255,0,255]);assert.equal(result.rejected,true);assert.deepEqual(result.svgSize,[8,6]);
  assert.equal(result.beforeLoss,'webgl2');assert.equal(result.afterLoss,'cpu');
  assert.deepEqual(result.gpuPixels.slice(0,4),[255,0,0,255]);assert.deepEqual(result.gpuPixels.slice(48,52),[0,0,255,255]);
  for(const [format,data] of Object.entries(result.formats)){assert.equal(data.mime,format==='jpg'?'image/jpeg':`image/${format}`);assert.equal(data.width,4);assert.equal(data.height,4);}
  const canvas=page.getByLabel('Image canvas.',{exact:false});await canvas.waitFor();await canvas.focus();
  await page.keyboard.press('+');await page.waitForTimeout(40);const zoom=await page.evaluate(()=>window.__viewport.zoom);assert.equal(zoom,1.25);
  await page.keyboard.press('ArrowRight');await page.waitForTimeout(40);const before=await page.evaluate(()=>window.__viewport);
  await page.mouse.move(400,250);await page.mouse.wheel(0,-100);await page.waitForTimeout(60);assert.ok(await page.evaluate(()=>window.__viewport.zoom)>before.zoom);
  const screenshot=process.env.IMAGE_CORE_SCREENSHOT;if(screenshot)await page.screenshot({path:screenshot});
  await page.evaluate(()=>window.__coreCleanup());
 } finally {await browser.close();await server.close();}
});
