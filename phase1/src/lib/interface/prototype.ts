import {parseInterfaceDocument,serializeInterfaceDocument,type InterfaceDocument,type InterfaceNode} from './model';
import type {PrototypeDirection,PrototypeEasing,PrototypeTransitionKind} from './schema';
import {computeInterfaceLayout} from './layout';
import {switchInstanceVariant,synchronizeInstances} from './components';
import {exportInterfaceFrame,exportInterfaceLayerSVG,exportInterfaceScrollContent} from './export';
export interface PreviewTransition {kind:Exclude<PrototypeTransitionKind,'instant'>;durationMs:number;easing?:PrototypeEasing;direction?:PrototypeDirection;}
export interface PrototypeState {overlayFrameId?:string;overlayPosition?:'center'|'left'|'right'|'top'|'bottom';snapshot:InterfaceDocument;frameId:string;startFrameId:string;history:string[];steps:number;notice:string;lastTransition?:PreviewTransition;variables:Record<string,string|number>;}
export interface TransitionLayerMatch {fromId:string;toId:string;name:string;from:{x:number;y:number;width:number;height:number};to:{x:number;y:number;width:number;height:number};}
export const MAX_TRANSITION_MATCHES=50;
/** Smart-animate pairs layers by name (first occurrence wins) between two frames on the frozen snapshot; rects are frame-relative. */
export function matchInterfaceTransitionLayers(snapshot:InterfaceDocument,fromFrameId:string,toFrameId:string,cap=MAX_TRANSITION_MATCHES):TransitionLayerMatch[]{
 const layout=computeInterfaceLayout(snapshot),map=new Map(snapshot.nodes.map(n=>[n.id,n])),fb=layout.bounds.get(fromFrameId),tb=layout.bounds.get(toFrameId);if(!fb||!tb)return [];
 const space=(rootId:string)=>{const out=new Map<string,{x:number;y:number;width:number;height:number}>();const walk=(id:string,ox:number,oy:number)=>{for(const c of map.get(id)?.children??[]){const b=layout.bounds.get(c);if(!b)continue;out.set(c,{x:ox+b.x,y:oy+b.y,width:b.width,height:b.height});walk(c,ox+b.x,oy+b.y);}};walk(rootId,0,0);return out;};
 const fromSpace=space(fromFrameId),toSpace=space(toFrameId);
 const collect=(rootId:string)=>{const out:InterfaceNode[]=[];const walk=(id:string)=>{for(const c of map.get(id)?.children??[]){const n=map.get(c);if(n&&!n.hidden){out.push(n);walk(c);}}};walk(rootId);return out;};
 const targets=new Map<string,InterfaceNode>();for(const n of collect(toFrameId))if(!targets.has(n.name))targets.set(n.name,n);
 const out:TransitionLayerMatch[]=[];
 for(const n of collect(fromFrameId)){const target=targets.get(n.name);if(!target)continue;const a=fromSpace.get(n.id),b=toSpace.get(target.id);if(!a||!b)continue;targets.delete(n.name);out.push({fromId:n.id,toId:target.id,name:n.name,from:a,to:b});if(out.length>=cap)break;}
 return out;
}
function freeze<T>(value:T):T{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export function initialPrototypeVariables(snapshot:InterfaceDocument):Record<string,string|number>{const out:Record<string,string|number>={};for(const v of snapshot.variables??[])out[v.id]=v.value;return out;}
/** Variable rows for the preview state panel: document order, runtime values. */
export function prototypeVariableState(state:PrototypeState):{id:string;name:string;type:'color'|'number';value:string|number;changed:boolean}[]{return (state.snapshot.variables??[]).map(v=>({id:v.id,name:v.name,type:v.type,value:state.variables[v.id]??v.value,changed:String(state.variables[v.id]??v.value)!==String(v.value)}));}
export function startInterfacePrototype(source:InterfaceDocument,requested?:string):PrototypeState{const snapshot=freeze(parseInterfaceDocument(serializeInterfaceDocument(source)));const frameId=requested??snapshot.prototypeStartFrameId??snapshot.nodes.find(n=>n.kind==='frame'&&!n.parentId&&!n.hidden)?.id;if(!frameId||!snapshot.nodes.some(n=>n.id===frameId&&n.kind==='frame'&&!n.parentId&&!n.hidden))throw Error('Select a visible page-root frame for preview.');return {snapshot,frameId,startFrameId:frameId,history:[],steps:0,notice:'',variables:initialPrototypeVariables(snapshot)};}
export interface PrototypeHotspot {id:string;name:string;x:number;y:number;width:number;height:number;click:boolean;hover:boolean;press:boolean;delay?:number;}
export function prototypeHotspots(state:PrototypeState):PrototypeHotspot[]{const map=new Map(state.snapshot.nodes.map(n=>[n.id,n])),layout=computeInterfaceLayout(state.snapshot),out:PrototypeHotspot[]=[];const root=map.get(state.overlayFrameId??state.frameId)!;const rb=layout.bounds.get(root.id)!;
 const walk=(id:string,x:number,y:number,clip:{left:number;top:number;right:number;bottom:number})=>{const n=map.get(id)!,b=layout.bounds.get(id)!;if(n.hidden)return;const left=x+b.x,top=y+b.y;const clipped={left:Math.max(clip.left,left),top:Math.max(clip.top,top),right:Math.min(clip.right,left+b.width),bottom:Math.min(clip.bottom,top+b.height)};if(n.prototypeLinks?.length&&clipped.right>clipped.left&&clipped.bottom>clipped.top)out.push({id:n.id,name:n.name,x:clipped.left,y:clipped.top,width:clipped.right-clipped.left,height:clipped.bottom-clipped.top,click:n.prototypeLinks.some(l=>l.trigger==='click'),hover:n.prototypeLinks.some(l=>l.trigger==='hover'),press:n.prototypeLinks.some(l=>l.trigger==='press'),delay:n.prototypeLinks.some(l=>l.trigger==='afterDelay')?Math.min(...n.prototypeLinks.filter(l=>l.trigger==='afterDelay').map(l=>l.delayMs!)):undefined});n.children.forEach(id=>walk(id,left,top,n.kind==='frame'?clipped:clip));};
 if(root.prototypeLinks?.length)out.push({id:root.id,name:root.name,x:0,y:0,width:rb.width,height:rb.height,click:root.prototypeLinks.some(l=>l.trigger==='click'),hover:root.prototypeLinks.some(l=>l.trigger==='hover'),press:root.prototypeLinks.some(l=>l.trigger==='press'),delay:root.prototypeLinks.some(l=>l.trigger==='afterDelay')?Math.min(...root.prototypeLinks.filter(l=>l.trigger==='afterDelay').map(l=>l.delayMs!)):undefined});root.children.forEach(id=>walk(id,0,0,{left:0,top:0,right:rb.width,bottom:rb.height}));return out;
}
export function activatePrototype(state:PrototypeState,nodeId:string,trigger:'click'|'hover'|'afterDelay'|'press'):PrototypeState{if(!prototypeHotspots(state).some(h=>h.id===nodeId&&(trigger==='click'?h.click:trigger==='hover'?h.hover:trigger==='press'?h.press:h.delay!==undefined)))return state;const link=state.snapshot.nodes.find(n=>n.id===nodeId)?.prototypeLinks?.find(l=>l.trigger===trigger);if(!link)return state;if(state.steps>=100)return {...state,notice:'Preview navigation budget reached. Restart to continue.'};
 const variables={...state.variables};for(const s of link.setVariables??[]){const variable=state.snapshot.variables?.find(v=>v.id===s.variableId);if(variable)variables[s.variableId]=variable.type==='number'?Number(s.value):s.value;}
 const pass=!link.condition||(variables[link.condition.variableId]!==undefined&&String(variables[link.condition.variableId])===link.condition.equals);
 const target=pass?link.targetFrameId:link.elseTargetFrameId;
 if(!pass&&!target)return {...state,variables,notice:'Condition not met; staying on this frame.'};
 const lastTransition:PreviewTransition|undefined=pass&&link.transition&&link.transition.kind!=='instant'?{kind:link.transition.kind as PreviewTransition['kind'],durationMs:link.transition.durationMs,...(link.transition.easing?{easing:link.transition.easing}:{}),...(link.transition.direction?{direction:link.transition.direction}:{})}:undefined;
 if(link.action==='back'){if(!state.overlayFrameId&&!state.history.length)return {...state,variables,steps:state.steps+1,notice:'Nothing to go back to.'};const next=backPrototype({...state,variables});return {...next,steps:state.steps+1,lastTransition};}
 const currentId=state.overlayFrameId??state.frameId;
 if(!target||target===currentId)return {...state,variables,steps:state.steps+1,notice:pass?'':'Condition not met; staying on this frame.'};
 if(pass&&link.action==='overlay')return {...state,variables,overlayFrameId:target,overlayPosition:link.position||'center',steps:state.steps+1,notice:'',lastTransition};return {...state,variables,overlayFrameId:undefined,overlayPosition:undefined,frameId:target,history:[...state.history.slice(-49),state.frameId],steps:state.steps+1,notice:'',lastTransition};}
export function backPrototype(state:PrototypeState):PrototypeState{if(state.overlayFrameId)return {...state,overlayFrameId:undefined,overlayPosition:undefined,notice:'',lastTransition:undefined};return state.history.length?{...state,frameId:state.history.at(-1)!,history:state.history.slice(0,-1),notice:'',lastTransition:undefined}:state;}
export function restartPrototype(state:PrototypeState):PrototypeState{return {...state,frameId:state.startFrameId,overlayFrameId:undefined,overlayPosition:undefined,history:[],steps:0,notice:'',lastTransition:undefined,variables:initialPrototypeVariables(state.snapshot)};}

export function closePrototypeOverlay(state:PrototypeState):PrototypeState{return {...state,overlayFrameId:undefined,overlayPosition:undefined,notice:'',lastTransition:undefined};}

/** Frame content height for scrollable previews: bottom-most visible child edge (falls back to frame height). */
export function prototypeContentHeight(state:PrototypeState,frameId:string):number{const map=new Map(state.snapshot.nodes.map(n=>[n.id,n])),layout=computeInterfaceLayout(state.snapshot);const frame=map.get(frameId);if(!frame)return 0;let bottom=layout.bounds.get(frameId)?.height??0;const walk=(id:string,oy:number)=>{for(const c of map.get(id)?.children??[]){const n=map.get(c),b=layout.bounds.get(c);if(!n||!b||n.hidden)continue;bottom=Math.max(bottom,oy+b.y+b.height);walk(c,oy+b.y);}};walk(frameId,0);return Math.ceil(bottom);}
export interface PrototypeStickyLayer {id:string;name:string;x:number;y:number;width:number;height:number;}
/** Layout viewport size of a frame inside the frozen snapshot. */
export function prototypeFrameViewport(state:PrototypeState,frameId:string):{width:number;height:number}{const b=computeInterfaceLayout(state.snapshot).bounds.get(frameId);return {width:b?.width??0,height:b?.height??0};}
/** Direct children of a frame flagged sticky, with frame-relative rects (they pin to the scroll viewport top). */
export function prototypeStickyLayers(state:PrototypeState,frameId:string):PrototypeStickyLayer[]{const map=new Map(state.snapshot.nodes.map(n=>[n.id,n])),layout=computeInterfaceLayout(state.snapshot);const frame=map.get(frameId);if(!frame)return [];const out:PrototypeStickyLayer[]=[];for(const c of frame.children){const n=map.get(c),b=layout.bounds.get(c);if(n&&b&&n.sticky&&!n.hidden)out.push({id:n.id,name:n.name,x:b.x,y:b.y,width:b.width,height:b.height});}return out;}
/** Convention: a component exposes a state variant when its name or a variant prop value matches the state word. */
export function interfaceStateVariant(snapshot:InterfaceDocument,componentId:string,state:'hover'|'pressed'):string|undefined{const re=state==='hover'?/hover/i:/pressed|active|down/i;const c=snapshot.components?.find(c=>c.id===componentId);if(!c)return undefined;for(const v of c.variants){if(re.test(v.name))return v.id;for(const val of Object.values(v.props??{}))if(typeof val==='string'&&re.test(val))return v.id;}return undefined;}
/** Owning instance root of a node inside the frozen snapshot (the node itself when it is an instance root). */
export function prototypeInstanceRoot(state:PrototypeState,nodeId:string):InterfaceNode|undefined{const map=new Map(state.snapshot.nodes.map(n=>[n.id,n]));let cur=map.get(nodeId);while(cur){if(cur.instance?.componentId)return cur;cur=cur.parentId?map.get(cur.parentId):undefined;}return undefined;}
/** Derived snapshot with one instance swapped to a state variant; undefined when the component has no such variant. */
export function prototypeStateVariantSnapshot(state:PrototypeState,instanceId:string,mode:'hover'|'pressed'):InterfaceDocument|undefined{const map=new Map(state.snapshot.nodes.map(n=>[n.id,n]));const inst=map.get(instanceId);const componentId=inst?.instance?.componentId;if(!inst||!componentId)return undefined;const variantId=interfaceStateVariant(state.snapshot,componentId,mode);if(!variantId||variantId===inst.instance?.variantId)return undefined;const doc=parseInterfaceDocument(serializeInterfaceDocument(state.snapshot));switchInstanceVariant(doc,instanceId,variantId);synchronizeInstances(doc);return freeze(doc);}

export interface InterfacePreviewExport {filename:string;html:string;frames:number;warnings:string[];}
const PREVIEW_EXPORT_FRAME_CAP=40;
function previewHTMLRuntime():string{return `(function(){
var cur=DATA.start,hist=[],overlay=null,timer=null,vars={};for(var vk in DATA.vars)vars[vk]=DATA.vars[vk];
function el(tag,cls){var n=document.createElement(tag);if(cls)n.className=cls;return n;}
function linksOf(id){return DATA.links[id]||[];}
function hotspotDiv(h,ox,oy,box){var ls=linksOf(h.id);if(!ls.length)return;var d=el('div','hot');d.style.left=(h.x-ox)+'px';d.style.top=(h.y-oy)+'px';d.style.width=h.width+'px';d.style.height=h.height+'px';d.title=h.name;d.setAttribute('role','button');d.setAttribute('tabindex','0');d.setAttribute('aria-label',h.name);
 function go(trig){var l=null;for(var i=0;i<ls.length;i++)if(ls[i].trigger===trig){l=ls[i];break;}if(l)follow(l);}
 d.addEventListener('click',function(){go('click');});d.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();go('click');}});
 d.addEventListener('mouseenter',function(){go('hover');});d.addEventListener('mousedown',function(){go('press');});box.appendChild(d);}
function animClass(tr){if(!tr||!tr.kind||tr.kind==='instant')return '';if(tr.kind==='dissolve'||tr.kind==='smart-animate')return 'anim-fade';var dir=tr.direction||'left';return 'anim-'+dir;}
function buildFrame(fid,box,animate){var f=DATA.frames[fid];var wrap=el('div','frame'+(animate?' '+animate:''));wrap.style.width=f.width+'px';wrap.style.height=f.height+'px';
 if(f.scroll&&f.contentHeight>f.height){var sc=el('div','scroll');sc.style.width=f.width+'px';sc.style.height=f.height+'px';var content=el('div','content');content.style.width=f.width+'px';content.style.height=f.contentHeight+'px';content.innerHTML=f.svg;
  (f.hotspots||[]).forEach(function(h){if(!f.stickyIds||f.stickyIds.indexOf(h.id)<0)hotspotDiv(h,0,0,content);});sc.appendChild(content);wrap.appendChild(sc);
  var pins=[];(f.sticky||[]).forEach(function(L){var pin=el('div','pin');pin.style.left=L.x+'px';pin.style.top=L.y+'px';pin.innerHTML=L.svg;(f.hotspots||[]).forEach(function(h){if(f.stickyIds&&f.stickyIds.indexOf(h.id)>=0)hotspotDiv(h,L.x,L.y,pin);});wrap.appendChild(pin);pins.push({node:pin,y:L.y});});
  if(pins.length)sc.addEventListener('scroll',function(){var st=sc.scrollTop;pins.forEach(function(p){p.node.style.top=Math.max(0,p.y-st)+'px';});});}
 else{wrap.innerHTML=f.svg;(f.hotspots||[]).forEach(function(h){hotspotDiv(h,0,0,wrap);});}
 box.appendChild(wrap);return wrap;}
function renderOverlay(){var old=document.getElementById('ovl');if(old)old.remove();if(!overlay)return;var f=DATA.frames[overlay.frame];var back=el('div','backdrop');back.id='ovl';back.addEventListener('click',function(e){if(e.target===back){overlay=null;renderOverlay();renderChrome();}});
 var pos=overlay.position||'center';var holder=el('div','modal modal-'+pos);var built=buildFrame(overlay.frame,holder,animClass(overlay.transition));
 var x=el('button','x');x.type='button';x.textContent='\u00d7';x.setAttribute('aria-label','Close overlay');x.addEventListener('click',function(){overlay=null;renderOverlay();renderChrome();});built.appendChild(x);
 back.appendChild(holder);document.getElementById('stage').appendChild(back);}
function renderChrome(){var b=document.getElementById('back');b.disabled=!(hist.length||overlay);document.getElementById('where').textContent=(DATA.frames[overlay?overlay.frame:cur]||{}).name||'';}
function render(tr){var stage=document.getElementById('stage');stage.innerHTML='';buildFrame(cur,stage,animClass(tr));renderOverlay();renderChrome();
 var f=DATA.frames[overlay?overlay.frame:cur],best=null;(f.hotspots||[]).forEach(function(h){(linksOf(h.id)).forEach(function(l){if(l.trigger==='afterDelay'&&(best===null||l.delayMs<best.delayMs))best=l;});});
 if(best)timer=setTimeout(function(){follow(best);},best.delayMs);}
function applySet(l){if(!l.setVariables)return;for(var i=0;i<l.setVariables.length;i++){var st=l.setVariables[i];if(DATA.vars[st.variableId]!==undefined)vars[st.variableId]=DATA.vartypes[st.variableId]==='number'?Number(st.value):st.value;}}
function follow(l){clearTimeout(timer);applySet(l);var target=l.targetFrameId,tr=l.transition,act=l.action,pos=l.position;
 if(l.condition){var cv=vars[l.condition.variableId];if(!(cv!==undefined&&String(cv)===l.condition.equals)){if(l.elseTargetFrameId){target=l.elseTargetFrameId;tr=null;act='navigate';}else{renderChrome();return;}}}
 if(act==='back'){if(overlay){overlay=null;renderOverlay();renderChrome();return;}if(hist.length){cur=hist.pop();render(tr);}return;}
 if(act==='overlay'){overlay={frame:target,position:pos||'center',transition:tr};renderOverlay();renderChrome();return;}
 if(target===cur){renderChrome();return;}
 overlay=null;if(hist.length>49)hist.shift();hist.push(cur);cur=target;render(tr);}
document.getElementById('back').addEventListener('click',function(){clearTimeout(timer);if(overlay){overlay=null;renderOverlay();renderChrome();return;}if(hist.length){cur=hist.pop();render();}});
document.getElementById('restart').addEventListener('click',function(){clearTimeout(timer);overlay=null;hist=[];cur=DATA.start;render();});
document.addEventListener('keydown',function(e){if(e.key==='Escape'){if(overlay){overlay=null;renderOverlay();renderChrome();}}if(e.altKey&&e.key==='ArrowLeft'){e.preventDefault();document.getElementById('back').click();}});
render();
})();`;}
function previewHTMLStyles():string{return 'html,body{margin:0;padding:0;background:#17181c;color:#e8e8ec;font:13px/1.4 system-ui,sans-serif;}header{display:flex;gap:8px;align-items:center;padding:10px 14px;background:#1f2026;border-bottom:1px solid #33343c;position:sticky;top:0;}header h1{font-size:13px;margin:0;font-weight:600;}header span{color:#9a9ba5;}button{background:#2a2b33;color:#e8e8ec;border:1px solid #3a3b44;border-radius:6px;padding:4px 10px;font:inherit;cursor:pointer;}button:disabled{opacity:.4;cursor:default;}#stage{padding:24px;overflow:auto;}.frame{position:relative;margin:0 auto;background:#fff;box-shadow:0 2px 18px rgba(0,0,0,.4);overflow:hidden;}.scroll{overflow-y:auto;overflow-x:hidden;position:relative;}.content{position:relative;}.content>svg,.frame>svg{display:block;}.pin{position:absolute;z-index:2;}.pin>svg{display:block;}.hot{position:absolute;cursor:pointer;background:transparent;z-index:3;}.hot:focus-visible{outline:2px solid #4f7cff;}.backdrop{position:absolute;inset:0;background:rgba(10,10,14,.45);z-index:5;}.modal{position:absolute;z-index:6;}.modal-center{left:50%;top:50%;transform:translate(-50%,-50%);}.modal-left{left:0;top:0;}.modal-right{right:0;top:0;}.modal-top{top:0;left:50%;transform:translateX(-50%);}.modal-bottom{bottom:0;left:50%;transform:translateX(-50%);}.x{position:absolute;top:4px;right:4px;z-index:7;}.anim-fade{animation:pv-fade .25s ease;}@keyframes pv-fade{from{opacity:0;}to{opacity:1;}}.anim-left{animation:pv-left .25s ease;}@keyframes pv-left{from{transform:translateX(60px);opacity:.6;}to{transform:none;opacity:1;}}.anim-right{animation:pv-right .25s ease;}@keyframes pv-right{from{transform:translateX(-60px);opacity:.6;}to{transform:none;opacity:1;}}.anim-up{animation:pv-up .25s ease;}@keyframes pv-up{from{transform:translateY(60px);opacity:.6;}to{transform:none;opacity:1;}}.anim-down{animation:pv-down .25s ease;}@keyframes pv-down{from{transform:translateY(-60px);opacity:.6;}to{transform:none;opacity:1;}}@media (prefers-reduced-motion:reduce){.anim-fade,.anim-left,.anim-right,.anim-up,.anim-down{animation:none;}}';}
/** Shareable offline preview: every page-root frame pre-rendered to inline SVG, links/hotspots/back-stack/scroll/sticky/overlays embedded, zero network. */
export function exportInterfacePreviewHTML(source:InterfaceDocument):InterfacePreviewExport{
 const snapshot=freeze(parseInterfaceDocument(serializeInterfaceDocument(source)));const frames=snapshot.nodes.filter(n=>n.kind==='frame'&&!n.parentId&&!n.hidden);
 const start=snapshot.prototypeStartFrameId&&frames.some(f=>f.id===snapshot.prototypeStartFrameId)?snapshot.prototypeStartFrameId:frames[0]?.id;
 if(!start)throw Error('Select a visible page-root frame for preview.');if(frames.length>PREVIEW_EXPORT_FRAME_CAP)throw Error(`Preview export supports up to ${PREVIEW_EXPORT_FRAME_CAP} frames.`);
 const warnings:string[]=[];const frameData:Record<string,unknown>={};const links:Record<string,unknown>={};
 for(const f of frames){const state:PrototypeState={snapshot,frameId:f.id,startFrameId:start,history:[],steps:0,notice:'',variables:initialPrototypeVariables(snapshot)};const sticky=prototypeStickyLayers(state,f.id);const stickyIds=new Set<string>();if(f.scroll){const map=new Map(snapshot.nodes.map(n=>[n.id,n]));const mark=(id:string)=>{stickyIds.add(id);map.get(id)?.children.forEach(mark);};sticky.forEach(l=>mark(l.id));}
  const exp=f.scroll?exportInterfaceScrollContent(snapshot,f.id,[...stickyIds]):exportInterfaceFrame(snapshot,f.id);warnings.push(...exp.warnings);
  const viewport=computeInterfaceLayout(snapshot).bounds.get(f.id)!;
  frameData[f.id]={name:f.name,width:viewport.width,height:viewport.height,svg:exp.svg,scroll:!!f.scroll,contentHeight:exp.height,hotspots:prototypeHotspots(state),sticky:sticky.slice(0,8).map(l=>({id:l.id,x:l.x,y:l.y,svg:exportInterfaceLayerSVG(snapshot,l.id).svg})),stickyIds:[...stickyIds]};}
 for(const n of snapshot.nodes)if(n.prototypeLinks?.length)links[n.id]=n.prototypeLinks;
 const vars:Record<string,string|number>={};const vartypes:Record<string,string>={};for(const v of snapshot.variables??[]){vars[v.id]=v.value;vartypes[v.id]=v.type;}
 const data=JSON.stringify({name:snapshot.name,start,frames:frameData,links,vars,vartypes}).replace(/</g,'\u003c');
 const title=String(snapshot.name||'Interface preview').replace(/&/g,'&amp;').replace(/</g,'&lt;');
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} - preview</title><style>${previewHTMLStyles()}</style></head><body><header><h1>${title}</h1><span id="where"></span><button id="back" type="button">&#8249; Back</button><button id="restart" type="button">Restart</button></header><div id="stage"></div><script>const DATA=${data};</script><script>${previewHTMLRuntime()}</script></body></html>`;
 if(new TextEncoder().encode(html).length>8_000_000)throw Error('Preview HTML exceeds the 8 MB export limit.');
 const safe=String(snapshot.name||'interface').replace(/[^a-z0-9-_]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase()||'interface';
 return {filename:`${safe}-preview.html`,html,frames:frames.length,warnings:[...new Set(warnings)]};
}
