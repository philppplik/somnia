import {test,expect} from './fixtures';
test('live preview runs ES modules with relative imports from files that are not open, and reports import cycles',async({page})=>{await page.goto('/');
 const out=await page.evaluate(async()=>{
  const b=await import('/src/lib/livePreviewResources.ts');const c=await import('/src/lib/previewAssetCache.ts');
  const b64=(s:string)=>btoa(s);
  const disk:Record<string,{mime:string;data:string}>={
   'js/main.js':{mime:'text/javascript',data:b64(`import {greet} from './lib/greet.js';\nimport {n} from '../shared/n.js';\ndocument.getElementById('o').textContent=greet('modules')+n;\nimport('./lazy.js').then(m=>{document.getElementById('l').textContent=m.lazy;});`)},
   'js/lib/greet.js':{mime:'text/javascript',data:b64(`import {n} from '../../shared/n.js';\nexport const greet=s=>'hi '+s+' '+n;`)},
   'shared/n.js':{mime:'text/javascript',data:b64('export const n=7;')},
   'js/lazy.js':{mime:'text/javascript',data:b64(`export const lazy='lazy-ok';`)},
   'cyc/a.js':{mime:'text/javascript',data:b64(`import './b.js';\ndocument.getElementById('c').textContent='a-ran';`)},
   'cyc/b.js':{mime:'text/javascript',data:b64(`import './a.js';\nexport const x=1;`)}};
  const invoke=async(cmd:string,a:any)=>{if(cmd!=='read_project_resource')throw Error(cmd);const f=disk[a.path];if(!f)throw {code:'not_found'};return{...f,size:f.data.length};};
  const probe='<script>addEventListener("load",function(){setTimeout(function(){parent.postMessage({probe:1,o:document.getElementById("o").textContent,l:document.getElementById("l").textContent,c:document.getElementById("c").textContent},"*")},300)})</script>';
  const run=async(html:string)=>{const files={'index.html':html+probe};
   const r=await b.buildPreviewWithResources({source:{invoke,projectId:'p'},files,active:'index.html',scripts:true,scrollY:0,cache:new c.PreviewAssetCache(),fallbackLoader:null});
   const f=document.createElement('iframe');f.setAttribute('sandbox','allow-scripts');document.body.append(f);
   const msg=new Promise<any>(res=>addEventListener('message',e=>{if(e.data&&e.data.probe)res(e.data);}));f.srcdoc=r.built.html;
   return{probe:await msg,cycles:r.cycles,unloaded:r.unloaded};};
  const ok=await run('<body><div id="o"></div><div id="l"></div><div id="c"></div><script type="module" src="js/main.js"></script>');
  const cyc=await run('<body><div id="o"></div><div id="l"></div><div id="c"></div><script type="module">import "./cyc/a.js"</script>');
  return{ok,cyc};});
 expect(out.ok.probe.o).toBe('hi modules 77');expect(out.ok.probe.l).toBe('lazy-ok');expect(out.ok.cycles).toEqual([]);expect(out.ok.unloaded).toEqual([]);
 expect(out.cyc.cycles).toEqual(['cyc/a.js → cyc/b.js → cyc/a.js']);expect(out.cyc.probe.c).toBe('a-ran');});
