import {test,expect} from './fixtures';
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
test('live preview renders CSS, JS and PNG that are not open in the editor, and reports files it could not load',async({page})=>{await page.goto('/');
 const out=await page.evaluate(async(png)=>{
  const b=await import('/src/lib/livePreviewResources.ts');const c=await import('/src/lib/previewAssetCache.ts');
  const b64=(s:string)=>btoa(s);const disk:Record<string,{mime:string;data:string}>={'css/s.css':{mime:'text/css',data:b64('@import "t.css";#d{width:4px;height:4px;background:url(../img/a.png)}')},'css/t.css':{mime:'text/css',data:b64('#e{color:rgb(1, 2, 3)}')},'js/app.js':{mime:'text/javascript',data:b64('document.getElementById("e").textContent="from-disk";')},'img/a.png':{mime:'image/png',data:png}};
  const reads:string[]=[];const invoke=async(cmd:string,a:any)=>{if(cmd!=='read_project_resource')throw Error(cmd);reads.push(a.path);const f=disk[a.path];if(!f)throw {code:'not_found'};return{...f,size:f.data.length};};
  const probe='<script>addEventListener("load",function(){setTimeout(function(){var d=document.getElementById("d");parent.postMessage({probe:1,txt:document.getElementById("e").textContent,color:getComputedStyle(document.getElementById("e")).color,bg:getComputedStyle(d).backgroundImage,w:document.getElementById("img").naturalWidth},"*")},300)})</script>';
  const files={'index.html':'<html><head><link rel="stylesheet" href="css/s.css"></head><body><div id="d"></div><div id="e"></div><img id="img" src="img/a.png"><img src="img/gone.png"><script src="js/app.js"></script>'+probe+'</body></html>'};
  const cache=new c.PreviewAssetCache();
  const r=await b.buildPreviewWithResources({source:{invoke,projectId:'p'},files,active:'index.html',scripts:true,scrollY:0,cache,fallbackLoader:null});
  const f=document.createElement('iframe');f.setAttribute('sandbox','allow-scripts');document.body.append(f);
  const msg=new Promise<any>(res=>addEventListener('message',e=>{if(e.data&&e.data.probe)res(e.data);}));f.srcdoc=r.built.html;
  const probeResult=await msg;
  const again=await b.buildPreviewWithResources({source:{invoke,projectId:'p'},files,active:'index.html',scripts:true,scrollY:0,cache,fallbackLoader:null});
  return{probe:probeResult,unloaded:r.unloaded,external:r.external,pngReads:reads.filter(p=>p==='img/a.png').length,againPngReads:reads.filter(p=>p==='img/a.png').length,againUnloaded:again.unloaded};},PNG);
 expect(out.probe.txt).toBe('from-disk');expect(out.probe.color).toBe('rgb(1, 2, 3)');expect(out.probe.bg).toContain('url("data:image/png');expect(out.probe.w).toBe(1);
 expect(out.unloaded).toEqual(['img/gone.png (not found)']);expect(out.external).toEqual([]);
 expect(out.pngReads).toBe(1);expect(out.againPngReads).toBe(1);expect(out.againUnloaded).toEqual(['img/gone.png (not found)']);});
