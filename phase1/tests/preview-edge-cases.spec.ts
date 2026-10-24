import {test,expect} from './fixtures';
test('live preview finds files with percent-encoded names and does not resolve links that leave the project',async({page})=>{await page.goto('/');
 const out=await page.evaluate(async()=>{
  const b=await import('/src/lib/livePreview.ts');
  const files={'pages/index.html':'<html><head><link rel="stylesheet" href="my%20style.css"><link rel="stylesheet" href="../../outside.css"><script src="my%20app.js"></script><script src="../../outside.js"></script></head><body><p id="p"></p></body></html>','pages/my style.css':'#p{color:rgb(1, 2, 3)}','pages/my app.js':'document.getElementById("p").textContent="ok"','outside.css':'#p{color:red}','outside.js':'throw new Error("must not run")'};
  const r=b.buildPreview(files,'pages/index.html',true);
  return{hasStyle:r.html.includes('rgb(1, 2, 3)'),hasApp:r.html.includes('textContent="ok"'),outsideCss:r.html.includes('color:red'),outsideJs:r.html.includes('must not run')};});
 expect(out).toEqual({hasStyle:true,hasApp:true,outsideCss:false,outsideJs:false});});
test('live preview rebuilds cleanly after repeated reloads with edits, deleted files and a bad import',async({page})=>{await page.goto('/');
 const out=await page.evaluate(async()=>{
  const b=await import('/src/lib/livePreview.ts');
  const run=(files:Record<string,string>)=>new Promise<any>(res=>{const r=b.buildPreview(files,'index.html',true);const f=document.createElement('iframe');f.setAttribute('sandbox','allow-scripts');document.body.append(f);const h=(e:MessageEvent)=>{if(e.data&&e.data.probe){removeEventListener('message',h);f.remove();res({probe:e.data,cycles:r.moduleCycles});}};addEventListener('message',h);f.srcdoc=r.html;});
  const probe='<script>addEventListener("load",()=>setTimeout(()=>parent.postMessage({probe:1,t:document.getElementById("e").textContent},"*"),150))</script>';
  const page='<div id="e"></div><script type="module">import {v} from "./m.js";document.getElementById("e").textContent=v</script>'+probe;
  const seq:any[]=[];
  seq.push(await run({'index.html':page,'m.js':'export const v="one"'}));
  seq.push(await run({'index.html':page,'m.js':'export const v="two"'}));
  seq.push(await run({'index.html':page}));
  seq.push(await run({'index.html':page,'m.js':'import "./m.js";export const v="cyc"'}));
  seq.push(await run({'index.html':page,'m.js':'export const v="three ü ✓"'}));
  return seq.map(s=>[s.probe.t,s.cycles.length]);});
 expect(out).toEqual([['one',0],['two',0],['',0],['cyc',1],['three ü ✓',0]]);});
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAEklEQVR4nGP4z8DwHxkzkC4AADxAH+HggXe0AAAAAElFTkSuQmCC';
test('root-relative refs inline from the project root in nested HTML, CSS, srcset and JS, with failed-file notes',async({page})=>{await page.goto('/');
 const out=await page.evaluate(async(png)=>{
  const b=await import('/src/lib/livePreviewResources.ts');const c=await import('/src/lib/previewAssetCache.ts');
  const disk:Record<string,{mime:string;data:string}>={
   'css/my style.css':{mime:'text/css',data:btoa('@import "/css/base.css";#bg{width:12px;height:12px;background:url(/img/my%20pic.png)}')},
   'css/base.css':{mime:'text/css',data:btoa('#p{color:rgb(1, 2, 3)}')},
   'js/app.js':{mime:'text/javascript',data:btoa('document.getElementById("classic").textContent="classic-root"')},
   'js/main.js':{mime:'text/javascript',data:btoa('import {v} from "/js/reexport.js";document.getElementById("p").textContent=v;import("/js/lazy.js").then(m=>document.getElementById("lazy").textContent=m.v)')},
   'js/reexport.js':{mime:'text/javascript',data:btoa('export {v} from "/js/value.js"')},
   'js/value.js':{mime:'text/javascript',data:btoa('export const v="module-root"')},
   'js/lazy.js':{mime:'text/javascript',data:btoa('export const v="dynamic-root"')},
   'img/my pic.png':{mime:'image/png',data:png}
  };
  const reads:string[]=[];const invoke=async<T>(cmd:string,args?:Record<string,unknown>):Promise<T>=>{if(cmd!=='read_project_resource')throw Error(cmd);const path=String(args?.path);reads.push(path);const f=disk[path];if(!f)throw {code:'not_found'};return{...f,size:atob(f.data).length} as T;};
  const probe='<script>addEventListener("load",()=>setTimeout(()=>{const q=(id)=>document.getElementById(id);parent.postMessage({rootProbe:1,classic:q("classic").textContent,module:q("p").textContent,lazy:q("lazy").textContent,color:getComputedStyle(q("p")).color,width:q("img").naturalWidth,setWidth:q("set").naturalWidth,bg:getComputedStyle(q("bg")).backgroundImage,inline:getComputedStyle(q("inline")).backgroundImage,block:getComputedStyle(q("block")).backgroundImage},"*")},150))</script>';
  const files={'pages/deep/index.html':'<link rel="stylesheet" href="/css/my%20style.css"><link rel="stylesheet" href="/../outside.css"><style>#block{background:url(/img/my%20pic.png)}</style><p id="classic"></p><p id="p"></p><p id="lazy"></p><img id="img" src="/img/my%20pic.png"><img id="set" srcset="/img/my%20pic.png 1x, /img/my%20pic.png 2x"><div id="bg"></div><div id="inline" style="background:url(/img/my%20pic.png)"></div><div id="block"></div><img src="/img/missing.png"><img src="/%2e%2e/outside.png"><img src="/"><script src="/js/app.js"></script><script type="module" src="/js/main.js"></script><script src="/../outside.js"></script>'+probe,'outside.css':'#p{color:red}','outside.js':'throw Error("escaped script ran")','escape':'throw Error("escaped script ran")'};
  const r=await b.buildPreviewWithResources({source:{invoke,projectId:'p'},files,active:'pages/deep/index.html',scripts:true,scrollY:0,cache:new c.PreviewAssetCache(),fallbackLoader:null});
  const doc=new DOMParser().parseFromString(r.built.html,'text/html');
  const f=document.createElement('iframe');f.id='root-preview';f.style.width='600px';f.style.height='400px';f.setAttribute('sandbox','allow-scripts');document.body.replaceChildren(f);
  const msg=new Promise<any>(res=>{const h=(e:MessageEvent)=>{if(e.source===f.contentWindow&&e.data?.rootProbe){removeEventListener('message',h);res(e.data);}};addEventListener('message',h);});f.srcdoc=r.built.html;
  return{probe:await msg,unloaded:r.unloaded,reads,scripts:r.built.scripts.map(s=>s.file),rootImg:doc.querySelector('#img')?.getAttribute('src'),rootSet:doc.querySelector('#set')?.getAttribute('srcset'),escapedJs:r.built.html.includes('escaped script ran'),escapedCss:r.built.html.includes('color:red')};
 },PNG);
 expect(out.probe).toMatchObject({classic:'classic-root',module:'module-root',lazy:'dynamic-root',color:'rgb(1, 2, 3)',width:4});
 expect(out.probe.setWidth).toBeGreaterThan(0);
 for(const key of ['bg','inline','block'])expect(out.probe[key]).toContain('url("data:image/png');
 expect(out.rootImg).toMatch(/^data:image\/png/);expect(out.rootSet).toMatch(/^data:image\/png.* 1x, data:image\/png.* 2x$/);
 expect(out.scripts).toContain('js/app.js');expect(out.scripts).toContain('js/main.js');
 expect(out.unloaded).toEqual(['/../outside.css (outside the project folder)','/%2e%2e/outside.png (outside the project folder)','/../outside.js (outside the project folder)','img/missing.png (not found)']);
 expect(out.reads).not.toContain('outside.css');expect(out.reads).not.toContain('outside.js');expect(out.reads).not.toContain('outside.png');expect(out.reads).not.toContain('');
 expect(out.escapedJs).toBe(false);expect(out.escapedCss).toBe(false);
 await page.screenshot({path:'/tmp/somnia-root-preview.png'});
});
test('root-relative in-memory SVG and missing binary files use the same asset pipeline as relative refs',async({page})=>{await page.goto('/');
 const out=await page.evaluate(async()=>{
  const b=await import('/src/lib/livePreviewAssets.ts');const c=await import('/src/lib/previewAssetCache.ts');
  const files={'nested/index.html':'<img src="/img/logo.svg"><video src="/media/v.mp4" poster="/img/missing.png"></video><audio src="/media/a.mp3"></audio><input type="image" src="/img/missing.png"><picture><source srcset="/img/missing.png 1x"></picture>','img/logo.svg':'<svg xmlns="http://www.w3.org/2000/svg"/>'};
  const reads:string[]=[];const r=await b.buildPreviewWithAssets(files,'nested/index.html',false,0,new c.PreviewAssetCache(),async p=>{reads.push(p);return null;});
  return{html:r.built.html,notes:r.notes,reads};
 });
 expect(out.html).toContain('data:image/svg+xml');expect(out.notes.sort()).toEqual(['img/missing.png (not found)','media/a.mp3 (not found)','media/v.mp4 (not found)']);
 expect(out.reads.sort()).toEqual(['img/missing.png','media/a.mp3','media/v.mp4']);
});
