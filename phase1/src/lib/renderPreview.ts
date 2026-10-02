import type { EditorNode } from './editorPort';
export function renderPreview(source:string,nodes:EditorNode[],files:Readonly<Record<string,string>>,activeFile:string){
 const flat:EditorNode[]=[];const walk=(ns:EditorNode[])=>ns.forEach(n=>{flat.push(n);walk(n.children);});walk(nodes);
 let marked=source;for(const n of [...flat].sort((a,b)=>b.contentFrom-a.contentFrom)){const pos=n.contentFrom-(source[n.contentFrom-2]==='/'?2:1);marked=marked.slice(0,pos)+` data-editor-node="${n.id}"`+marked.slice(pos);}
 const doc=new DOMParser().parseFromString(marked,'text/html');
 const relative=(href:string)=>{if(/^(?:[a-z]+:|\/\/|\/)/i.test(href))return null;const parts=[...activeFile.split('/').slice(0,-1),...href.split(/[?#]/)[0].split('/')],out:string[]=[];for(const p of parts){if(p==='..')out.pop();else if(p&&p!=='.')out.push(p);}return out.join('/');};
 for(const el of doc.querySelectorAll('script,iframe,object,embed,base,meta[http-equiv],link:not([rel=stylesheet])'))el.remove();
 for(const el of doc.querySelectorAll('link[rel=stylesheet]')){const f=relative(el.getAttribute('href')||'');const css=f?files[f]:null;if(css!=null){const style=doc.createElement('style');style.textContent=css;el.replaceWith(style);}else el.remove();}
 for(const el of doc.querySelectorAll('*')){
  for(const a of [...el.attributes])if(/^on/i.test(a.name)||['srcdoc','action','formaction','autofocus','contenteditable'].includes(a.name))el.removeAttribute(a.name);
  for(const a of ['src','href','srcset','poster','background'])if(el.hasAttribute(a)){const v=el.getAttribute(a)!;if(!(a==='src'&&/^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(v)))el.removeAttribute(a);}
  if(el.localName==='input'||el.localName==='button'||el.localName==='select'||el.localName==='textarea')el.setAttribute('tabindex','-1');
 }
 for(const n of flat)if(n.hidden)doc.querySelector(`[data-editor-node="${n.id}"]`)?.setAttribute('style','display:none');
 const meta=doc.createElement('meta');meta.httpEquiv='Content-Security-Policy';meta.content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; form-action 'none'; object-src 'none'; base-uri 'none'";doc.head.prepend(meta);
 return '<!doctype html>'+doc.documentElement.outerHTML;
}
