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
