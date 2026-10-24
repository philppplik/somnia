import {parse} from '@babel/parser';
const TOKEN=/^[a-f0-9]{32,128}$/;
/** `inlineScripts` is for server-rendered frameworks (Astro, SvelteKit, Nuxt): their pages carry inline start-up scripts. */
export function previewPolicy(port,options={}){
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid preview port');
 return `default-src 'self'; script-src 'self'${options.inlineScripts===true?" 'unsafe-inline'":''}; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:${port}; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-src 'none'; frame-ancestors 'none'`;
}
export function instrumentSource(code,id,root){
 const path=id.split('?')[0].replaceAll('\\','/');const base=root.replaceAll('\\','/').replace(/\/$/,'')+'/';
 if(!path.startsWith(base)||path.includes('/node_modules/')||! /\.[jt]sx$/.test(path))return code;
 const file=path.slice(base.length);if(file.includes('..')||file.includes(':'))return code;
 const ast=parse(code,{sourceType:'module',plugins:['jsx',...(path.endsWith('.tsx')?['typescript']:[])]});
 const inserts=[];
 function visit(node){if(!node||typeof node!=='object')return;
  if(node.type==='JSXOpeningElement'&&node.name.type==='JSXIdentifier'&&/^[a-z]/.test(node.name.name)&&!node.attributes.some(a=>a.name?.name==='data-somnia-src'))inserts.push([node.name.end,` data-somnia-src=${JSON.stringify(`${file}:${node.loc.start.line}`)}`]);
  for(const [key,value] of Object.entries(node)){if(key==='loc')continue;if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}
 }
 visit(ast);for(const [at,text] of inserts.sort((a,b)=>b[0]-a[0]))code=code.slice(0,at)+text+code.slice(at);return code;
}
function lineOf(code,offset){let line=1;for(let i=0;i<offset;i++)if(code.charCodeAt(i)===10)line++;return line;}
function projectFile(id,root,extension){
 const clean=id.split('?')[0].replaceAll('\\','/');const base=root.replaceAll('\\','/').replace(/\/$/,'')+'/';
 if(id.includes('?')||!clean.startsWith(base)||clean.includes('/node_modules/')||!clean.endsWith(extension))return null;
 const file=clean.slice(base.length);return file.includes('..')||file.includes(':')?null:file;
}
function applyInserts(code,inserts){for(const [at,text] of inserts.sort((a,b)=>b[0]-a[0]))code=code.slice(0,at)+text+code.slice(at);return code;}
/** Vue single file components. Only plain HTML elements get a marker, components and slots do not. */
export function instrumentVue(code,id,root,parseSfc){
 const file=projectFile(id,root,'.vue');if(!file)return code;
 const ast=parseSfc(code,{filename:file}).descriptor.template?.ast;if(!ast)return code;const inserts=[];
 (function visit(node){if(!node||typeof node!=='object')return;
  if(node.type===1&&node.tagType===0&&/^[a-z]/.test(node.tag)&&!node.props.some(p=>p.name==='data-somnia-src'))inserts.push([node.loc.start.offset+1+node.tag.length,` data-somnia-src=${JSON.stringify(`${file}:${node.loc.start.line}`)}`]);
  for(const child of node.children??[])visit(child);})(ast);
 return applyInserts(code,inserts);
}
/** Svelte 5 components. Walks the markup AST only, so script and style text is never touched. */
export function instrumentSvelte(code,id,root,parseSvelte){
 const file=projectFile(id,root,'.svelte');if(!file)return code;
 const ast=parseSvelte(code,{modern:true});const inserts=[];const seen=new WeakSet();
 (function visit(node){if(!node||typeof node!=='object'||seen.has(node))return;seen.add(node);
  if(node.type==='RegularElement'&&typeof node.name==='string'&&Number.isInteger(node.start)&&!node.attributes.some(a=>a.name==='data-somnia-src'))inserts.push([node.start+1+node.name.length,` data-somnia-src=${JSON.stringify(`${file}:${lineOf(code,node.start)}`)}`]);
  for(const value of Object.values(node))if(value&&typeof value==='object')visit(value);})(ast.fragment);
 return applyInserts(code,inserts);
}
export function validSourceEvent(event){
 return !!event&&typeof event.file==='string'&&event.file.length<=1024&&!/[\\:\x00-\x1f]/.test(event.file)&&!event.file.startsWith('/')&&event.file.split('/').every(part=>part&&part!=='.'&&part!=='..'&&part!=='node_modules'&&part!=='.git')&&Number.isInteger(event.line)&&event.line>0&&event.line<1_000_000&&Number.isInteger(event.col)&&event.col>0&&event.col<1_000_000;
}
export default function somniaPreview(options={}){
 const token=process.env.SOMNIA_PREVIEW_TOKEN;const port=Number(process.env.SOMNIA_PREVIEW_PORT);
 if(!token)return {name:'somnia-preview',apply:'serve'}; // ordinary external Vite use remains possible
 if(!TOKEN.test(token))throw Error('Invalid Somnia preview configuration');
 const policy=previewPolicy(port,options);let root='';let vueParser,svelteParser;
 const cookieName=`somnia_preview_${port}`;const inlineModules=new Map();const sourceEvents=[];
 const hasCookie=req=>String(req.headers.cookie??'').split(';').some(part=>part.trim()===`${cookieName}=${token}`);
 return {name:'somnia-preview',apply:'serve',enforce:'pre',
  config(){return {server:{host:'127.0.0.1',port,strictPort:true,allowedHosts:['127.0.0.1'],cors:false,hmr:{host:'127.0.0.1',port},headers:{'Content-Security-Policy':policy,'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}}};},
  configResolved(config){root=config.root;},
  configureServer(server){
   server.middlewares.use((req,res,next)=>{
    if(req.headers.host!==`127.0.0.1:${port}`){res.statusCode=403;res.end('Forbidden');return;}
    const url=new URL(req.url??'/',`http://127.0.0.1:${port}`);
    if(url.pathname==='/__somnia/source-events'){
     if(req.method==='GET'){
      if(req.headers.authorization!==`Bearer ${token}`){res.statusCode=403;res.end('Forbidden');return;}
      res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({events:sourceEvents.splice(0,64)}));return;
     }
     if(req.method!=='POST'||!hasCookie(req)||req.headers.origin!==`http://127.0.0.1:${port}`||req.headers['content-type']!=='application/json'){res.statusCode=403;res.end('Forbidden');return;}
     let body='';let rejected=false;req.on('data',chunk=>{body+=chunk;if(body.length>2048){rejected=true;res.statusCode=413;res.end('Too large');req.destroy();}});
     req.on('end',()=>{if(rejected)return;try{const event=JSON.parse(body);if(!validSourceEvent(event))throw Error('Invalid');sourceEvents.push({file:event.file,line:event.line,col:event.col});if(sourceEvents.length>64)sourceEvents.shift();res.statusCode=204;res.end();}catch{res.statusCode=400;res.end('Invalid source');}});return;
    }
    if(url.searchParams.get('somnia-preview-token')===token){res.setHeader('Set-Cookie',`${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/`);url.searchParams.delete('somnia-preview-token');req.url=url.pathname+url.search;}
    else if(!hasCookie(req)){res.statusCode=403;res.end('Forbidden');return;}
    res.setHeader('Content-Security-Policy',policy);res.setHeader('Cache-Control','no-store');
    if(inlineModules.has(url.pathname)){res.setHeader('Content-Type','text/javascript');res.end(inlineModules.get(url.pathname));return;}next();
   });
   server.httpServer?.prependListener('upgrade',(req,socket)=>{if(req.headers.host!==`127.0.0.1:${port}`||!hasCookie(req)||req.headers.origin!==`http://127.0.0.1:${port}`)socket.destroy();});
  },
  async transform(code,id){
   let transformed=code;
   try{
    if(!id.includes('?')&&id.endsWith('.vue')){vueParser??=await import('vue/compiler-sfc').then(m=>m.parse,()=>null);if(vueParser)transformed=instrumentVue(code,id,root,vueParser);}
    else if(!id.includes('?')&&id.endsWith('.svelte')){svelteParser??=await import('svelte/compiler').then(m=>m.parse,()=>null);if(svelteParser)transformed=instrumentSvelte(code,id,root,svelteParser);}
    else transformed=instrumentSource(code,id,root);
   }catch{return null;} // a syntax error must surface from the framework compiler, never from the preview plugin
   return transformed===code?null:{code:transformed,map:null};
  },
  transformIndexHtml:{order:'post',handler(html){let i=0;html=html.replace(/<script\b([^>]*type="module"[^>]*)>([\s\S]*?)<\/script>/g,(whole,attrs,body)=>{if(/\bsrc=/.test(attrs)||!body.trim())return whole;const path=`/__somnia_inline_${i++}.js`;inlineModules.set(path,body);return `<script type="module" src="${path}"></script>`;});return html.replace('</body>','<script type="module" src="/__somnia_click_source.js"></script></body>');}},
  resolveId(id){return id==='/__somnia_click_source.js'?'\0somnia-click-source':null;},
  load(id){if(id!=='\0somnia-click-source')return null;return `document.addEventListener('click',event=>{if(!event.altKey)return;const node=event.target.closest?.('[data-somnia-src]');if(!node)return;const match=/^(.+):(\\d+)$/.exec(node.dataset.somniaSrc);if(!match)return;event.preventDefault();event.stopPropagation();fetch('/__somnia/source-events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file:match[1],line:Number(match[2]),col:1})}).catch(()=>{});},true);`;}
 };
}
