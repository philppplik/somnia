/** Builds the srcDoc for the opt-in live preview. Runs in a sandboxed iframe (allow-scripts only, opaque origin). Project CSS and JS are inlined from the project files; no network. */
const resolve=(active:string,href:string)=>{if(/^(?:[a-z]+:|\/\/|\/)/i.test(href))return null;const parts=[...active.split('/').slice(0,-1),...href.split(/[?#]/)[0].split('/')],out:string[]=[];for(const p of parts){if(p==='..')out.pop();else if(p&&p!=='.')out.push(p);}return out.join('/');};
const esc=(s:string)=>s.replace(/<\/(script)/gi,'<\\/$1');
export function buildPreviewDoc(files:Readonly<Record<string,string>>,active:string,scripts:boolean,scrollY=0):string{
 const doc=new DOMParser().parseFromString(files[active]??'','text/html');
 for(const el of doc.querySelectorAll('base,meta[http-equiv],iframe,object,embed'))el.remove();
 for(const el of doc.querySelectorAll('link[rel=stylesheet]')){const f=resolve(active,el.getAttribute('href')||'');const css=f?files[f]:null;if(css!=null){const s=doc.createElement('style');s.textContent=css;el.replaceWith(s);}else el.remove();}
 for(const el of doc.querySelectorAll('script')){
  if(!scripts){el.remove();continue;}
  const src=el.getAttribute('src');if(src){const f=resolve(active,src);const js=f?files[f]:null;if(js!=null){const s=doc.createElement('script');if(el.getAttribute('type'))s.setAttribute('type',el.getAttribute('type')!);s.textContent=esc(js);el.replaceWith(s);}else el.remove();}}
 for(const el of doc.querySelectorAll('img[src]')){const f=resolve(active,el.getAttribute('src')||'');const svg=f&&/\.svg$/i.test(f)?files[f]:null;if(svg!=null)el.setAttribute('src','data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg));}
 for(const el of doc.querySelectorAll('a[href],form')){if(el.localName==='form')el.setAttribute('onsubmit','return false');else el.setAttribute('href','#');}
 for(const a of ['target'])for(const el of doc.querySelectorAll(`[${a}]`))el.removeAttribute(a);
 const meta=doc.createElement('meta');meta.httpEquiv='Content-Security-Policy';meta.content=`default-src 'none'; script-src ${scripts?"'unsafe-inline'":"'none'"}; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; object-src 'none'; base-uri 'none'`;
 doc.head.prepend(meta);
 if(scripts){const b=doc.createElement('script');b.textContent=`(function(){var p=function(m){try{parent.postMessage(m,'*')}catch(e){}};addEventListener('error',function(e){if(e.target&&e.target!==window){p({somnia:'error',message:'Failed to load '+(e.target.src||e.target.href||e.target.localName)});return}p({somnia:'error',message:String(e.message),line:e.lineno,col:e.colno})},true);addEventListener('unhandledrejection',function(e){p({somnia:'error',message:'Unhandled promise rejection: '+String(e.reason)})});var t;addEventListener('scroll',function(){clearTimeout(t);t=setTimeout(function(){p({somnia:'scroll',y:scrollY})},100)});addEventListener('load',function(){scrollTo(0,${Math.max(0,Math.round(scrollY))})})})();`;doc.head.prepend(b);}
 return '<!doctype html>'+doc.documentElement.outerHTML;}
