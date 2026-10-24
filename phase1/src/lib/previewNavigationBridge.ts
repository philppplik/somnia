/** This trusted bridge runs even with project scripts off. CSP grants only its nonce. Besides link and scroll handling it swaps linked stylesheets in place (`css` messages from the parent) for hot CSS. */
export function installPreviewNavigation(doc:Document,id:string,nonce:string,hash='',scrollY=0){
 const links:Array<{href:string;index:number}>=[];
 for(const element of doc.querySelectorAll('[data-somnia-link]'))element.removeAttribute('data-somnia-link');
 for(const [index,anchor] of [...doc.querySelectorAll('a[href],area[href]')].entries()){
  links.push({href:anchor.getAttribute('href')||'',index});anchor.setAttribute('data-somnia-link',String(index));anchor.setAttribute('href','#');anchor.removeAttribute('target');anchor.removeAttribute('download');
 }
 const bridge=doc.createElement('script');bridge.setAttribute('nonce',nonce);
 bridge.textContent=`(function(){
 var id=${JSON.stringify(id)},links=${JSON.stringify(links).replace(/</g,'\\u003c')},saved=new WeakMap();
 addEventListener('DOMContentLoaded',function(){links.forEach(function(link){var a=document.querySelector('[data-somnia-link="'+link.index+'"]');if(a){saved.set(a,link.href);a.removeAttribute('data-somnia-link')}})});
 function emit(m){m.id=id;parent.postMessage(m,'*')}
 function anchor(hash,y){if(hash){var name;try{name=decodeURIComponent(hash.slice(1))}catch(e){return}var target=document.getElementById(name)||Array.from(document.getElementsByName(name)).find(function(el){return el.tagName==='A'});if(target)target.scrollIntoView();else if(!name)scrollTo(0,0)}else scrollTo(0,y||0)}
 addEventListener('click',function(e){var a=e.target instanceof Element?e.target.closest('a,area'):null;if(!a)return;e.preventDefault();if(!e.isTrusted||e.button!==0)return;var href=saved.has(a)?saved.get(a):a.getAttribute('href');if(href)emit({somnia:'navigate',href:href})},true);
 addEventListener('submit',function(e){e.preventDefault()},true);
 addEventListener('message',function(e){if(e.source!==parent||!e.data||e.data.id!==id)return;if(e.data.somnia==='css'){var els=document.querySelectorAll('style[data-somnia-css]');for(var i=0;i<els.length;i++)if(els[i].getAttribute('data-somnia-css')===e.data.path)els[i].textContent=String(e.data.css);return}if(e.data.somnia!=='navigate-scroll')return;anchor(e.data.hash,e.data.y)});
 addEventListener('load',function(){anchor(${JSON.stringify(hash).replace(/</g,'\\u003c')},${Math.max(0,Math.round(scrollY))})});
 var t;addEventListener('scroll',function(){clearTimeout(t);t=setTimeout(function(){emit({somnia:'scroll',y:scrollY})},100)});
 })();`;
 doc.head.prepend(bridge);
}
