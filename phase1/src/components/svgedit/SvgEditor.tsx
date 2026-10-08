import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {useT} from '../../lib/useT';
import {useAppStore} from '../../store/appStore';
import {buildDisplay} from '../../lib/svgedit/display';
import {getUi,patchUi,setCursor,useSvgUi,type Tool} from '../../lib/svgedit/store';
import * as C from '../../lib/svgedit/controller';
import {elementAt,parsePathKey,pathKey,attr,type XEl} from '../../lib/svgedit/source';
import {HANDLES,invert,apply,rotateAbout,resizeDelta,translate,changesForDelta,mul,type Box,type Handle,type Matrix} from '../../lib/svgedit/geometry';
import {pathToContours,contoursToPath,moveNode,moveHandle,nearestOnContour,insertNode,deleteNode,setKind,type Contour} from '../../lib/svgedit/pathnodes';
import {serializeContour} from '../../lib/vectorio/serialize';
import type {Point,VectorNode} from '../../lib/vectorio/types';
import {SvgOptionsBar} from './SvgOptionsBar';
import {SvgFooter} from './SvgFooter';

const PAD=56;
type Session=
 |{k:'pan';sx:number;sy:number;l:number;t:number}
 |{k:'move';start:Point;keys:string[];moved:boolean;sx:number;sy:number}
 |{k:'resize';handle:Handle;box:Box;keys:string[]}
 |{k:'rotate';box:Box;keys:string[];start:number}
 |{k:'marquee';start:Point;additive:boolean}
 |{k:'shape';tool:Tool;start:Point;parent:string}
 |{k:'pen-handle';node:VectorNode}
 |{k:'node';c:number;i:number;part:'node'|'in'|'out';key:string}
const M=(m:DOMMatrix|null|undefined):Matrix=>m?[m.a,m.b,m.c,m.d,m.e,m.f]:[1,0,0,1,0,0];
const attrsOf=(el:XEl)=>({tag:el.tag,get:(n:string)=>attr(el,n)});

export function SvgEditor({file,text}:{file:string;text:string}){
 const {t}=useT();const state=useAppStore();const ui=useSvgUi();
 const scroller=useRef<HTMLDivElement>(null),wrap=useRef<HTMLDivElement>(null),host=useRef<HTMLDivElement>(null);
 const session=useRef<Session|null>(null);const [tick,setTick]=useState(0);const redraw=useCallback(()=>setTick(n=>n+1),[]);
 const [marquee,setMarquee]=useState<Box|null>(null);const [shapePrev,setShapePrev]=useState<{tool:Tool;a:Point;b:Point;shift:boolean;alt:boolean}|null>(null);
 const [draft,setDraft]=useState<{parent:string;nodes:VectorNode[]}|null>(null);const [hover,setHover]=useState<Point|null>(null);
 const [nodeDraft,setNodeDraft]=useState<Contour[]|null>(null);const [editing,setEditing]=useState<{key:string;value:string}|null>(null);
 const [spaceDown,setSpaceDown]=useState(false);const [error,setError]=useState('');
 const display=useMemo(()=>{const d=buildDisplay(text);setError(d?'':t('svg.invalid'));return d;},[text]);// eslint-disable-line react-hooks/exhaustive-deps
 const scanned=C.scan();const root=scanned.root;

 // Mount the display DOM
 useLayoutEffect(()=>{const h=host.current;if(!h)return;if(!display){h.replaceChildren();C.view.svg=null;redraw();return;}
  h.replaceChildren(display.svg);C.view.svg=display.svg;C.view.svg.style.display='block';redraw();
  return()=>{if(C.view.svg===display.svg)C.view.svg=null;};},[display,redraw]);
 // Zoom
 const fitZoom=useCallback(()=>{const s=scroller.current;if(!s||!display)return 1;return Math.max(0.05,Math.min(8,Math.min((s.clientWidth-PAD*2)/display.w,(s.clientHeight-PAD*2)/display.h)));},[display]);
 const zoom=ui.fit?fitZoom():ui.zoom;const [,setSize]=useState(0);
 useEffect(()=>{const s=scroller.current;if(!s)return;const ro=new ResizeObserver(()=>{setSize(n=>n+1);redraw();});ro.observe(s);return()=>ro.disconnect();},[redraw]);
 useLayoutEffect(()=>{const svg=display?.svg;if(!svg||!display)return;svg.setAttribute('width',String(display.w*zoom));svg.setAttribute('height',String(display.h*zoom));redraw();},[display,zoom,redraw]);
 // Drop selection keys that no longer exist
 useEffect(()=>{if(!root)return;const keep=ui.selection.filter(k=>!!elementAt(root,parsePathKey(k))&&k!=='');if(keep.length!==ui.selection.length)patchUi({selection:keep});},[text]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{patchUi({node:null});setDraft(null);setEditing(null);},[file,ui.tool]);
 useEffect(()=>{if(ui.selection.length!==1)patchUi({node:null});},[ui.selection]);

 // Wheel: ctrl/cmd zoom around the pointer
 useEffect(()=>{const s=scroller.current;if(!s)return;const on=(e:WheelEvent)=>{if(!(e.ctrlKey||e.metaKey))return;e.preventDefault();const z0=getUi().fit?fitZoom():getUi().zoom;const z=Math.min(32,Math.max(0.05,z0*Math.exp(-e.deltaY*0.0025)));
  const r=s.getBoundingClientRect();const px=e.clientX-r.left+s.scrollLeft,py=e.clientY-r.top+s.scrollTop;patchUi({zoom:z,fit:false});
  requestAnimationFrame(()=>{s.scrollLeft=px*(z/z0)-(e.clientX-r.left);s.scrollTop=py*(z/z0)-(e.clientY-r.top);});};
  s.addEventListener('wheel',on,{passive:false});return()=>s.removeEventListener('wheel',on);},[fitZoom]);

 // ---- coordinate helpers ---------------------------------------------------------------------------------
 const origin=()=>{const r=wrap.current?.getBoundingClientRect();return{x:r?.left??0,y:r?.top??0};};
 const toOv=(p:Point):Point=>{const c=C.rootToClient(p.x,p.y);const o=origin();return{x:c.x-o.x,y:c.y-o.y};};
 const clientToLocal=(key:string,cx:number,cy:number):Point=>apply(invert(M(C.domEl(key)?.getScreenCTM())),cx,cy);
 const rootPt=(e:{clientX:number;clientY:number}):Point=>C.clientToRoot(e.clientX,e.clientY);
 const selBox=():Box|null=>C.boxOfKeys(C.topKeys(ui.selection));
 void tick;

 // ---- preview helpers --------------------------------------------------------------------------------------
 const previewDelta=(keys:string[],delta:Matrix)=>{if(!root)return;for(const key of C.topKeys(keys)){const el=elementAt(root,parsePathKey(key));const dom=C.domEl(key);if(!el||!dom)continue;
  const ch=changesForDelta(attrsOf(el),delta,C.parentToRoot(key));for(const [n,v] of Object.entries(ch)){if(v===null)dom.removeAttribute(n);else dom.setAttribute(n,v);}}redraw();};

 // ---- pointer ----------------------------------------------------------------------------------------------
 const hitKey=(target:EventTarget|null):string|null=>{let n=target as Element|null;while(n&&!(n instanceof SVGElement&&n.hasAttribute('data-sp'))){n=n.parentElement;if(n===host.current)return null;}
  if(!n)return null;const key=n.getAttribute('data-sp')!;if(key==='')return null;
  const p=parsePathKey(key);for(let i=1;i<=p.length;i++)if(getUi().locked.includes(pathKey(p.slice(0,i))))return null;return key;};
 const onDown=(e:React.PointerEvent)=>{
  if(!display||!root||e.button===2)return;scroller.current?.focus({preventScroll:true});
  const tgt=e.target as Element;const hd=tgt.getAttribute?.('data-h');const nd=tgt.getAttribute?.('data-n');
  const capture=()=>wrap.current?.setPointerCapture(e.pointerId);
  if(e.button===1||spaceDown||(e.button===0&&getUi().tool==='select'&&false)){session.current={k:'pan',sx:e.clientX,sy:e.clientY,l:scroller.current!.scrollLeft,t:scroller.current!.scrollTop};capture();return;}
  const p=rootPt(e);const tool=getUi().tool;const sel=getUi().selection;
  if(tool==='select'){
   if(hd){const box=selBox();if(!box)return;capture();
    if(hd==='rot'){const cx=box.x+box.w/2,cy=box.y+box.h/2;session.current={k:'rotate',box,keys:sel,start:Math.atan2(p.y-cy,p.x-cx)};}
    else session.current={k:'resize',handle:hd as Handle,box,keys:sel};return;}
   const key=hitKey(e.target);capture();
   if(key){if(e.shiftKey){patchUi({selection:sel.includes(key)?sel.filter(k=>k!==key):[...sel,key]});session.current=null;return;}
    const keys=sel.includes(key)?sel:[key];if(keys!==sel)patchUi({selection:keys});session.current={k:'move',start:p,keys,moved:false,sx:e.clientX,sy:e.clientY};return;}
   session.current={k:'marquee',start:p,additive:e.shiftKey};if(!e.shiftKey)patchUi({selection:[]});return;}
  if(tool==='node'){
   const key1=sel.length===1?sel[0]:null;capture();
   if(nd&&key1){const [c,i,part]=nd.split(':');const ci=+c,ii=+i;patchUi({node:{c:ci,i:ii}});session.current={k:'node',c:ci,i:ii,part:part as 'node'|'in'|'out',key:key1};const el=elementAt(root,parsePathKey(key1));setNodeDraft(el&&C.contoursOf(el));return;}
   const key=hitKey(e.target);if(key){patchUi({selection:[key],node:null});}else{patchUi({selection:[],node:null});}session.current=null;return;}
  if(tool==='rect'||tool==='ellipse'||tool==='line'){capture();const parent=C.insertionParent();session.current={k:'shape',tool,start:p,parent};setShapePrev({tool,a:p,b:p,shift:false,alt:false});return;}
  if(tool==='text'){const parent=C.insertionParent();const lp=apply(invert(C.keyToRoot(parent)),p.x,p.y);const size=Math.max(8,Math.round(display.w/20));
   if(C.addElement(C.textSrc(lp.x,lp.y,t('svg.textDefault'),size),parent)){requestAnimationFrame(()=>setEditing({key:getUi().selection[0],value:t('svg.textDefault')}));}return;}
  if(tool==='pen'){capture();const parent=draft?.parent??C.insertionParent();const lp=apply(invert(C.keyToRoot(parent)),p.x,p.y);
   const nodes=draft?.nodes??[];
   if(nodes.length>=2){const first=toOv(apply(C.keyToRoot(parent),nodes[0].x,nodes[0].y));const here=toOv(p);if(Math.hypot(first.x-here.x,first.y-here.y)<9){finishPen(parent,nodes,true);return;}}
   const node:VectorNode={id:`d${nodes.length}`,x:lp.x,y:lp.y,kind:'corner'};setDraft({parent,nodes:[...nodes,node]});session.current={k:'pen-handle',node};return;}
 };
 const onMove=(e:React.PointerEvent)=>{
  if(display){const p=rootPt(e);setCursor({x:p.x,y:p.y});}
  const s=session.current;
  if(!s){if(getUi().tool==='pen'&&draft){setHover(rootPt(e));}return;}
  if(s.k==='pan'){scroller.current!.scrollLeft=s.l-(e.clientX-s.sx);scroller.current!.scrollTop=s.t-(e.clientY-s.sy);return;}
  const p=rootPt(e);
  if(s.k==='move'){if(!s.moved&&Math.hypot(e.clientX-s.sx,e.clientY-s.sy)<3)return;s.moved=true;let dx=p.x-s.start.x,dy=p.y-s.start.y;if(e.shiftKey){if(Math.abs(dx)>Math.abs(dy))dy=0;else dx=0;}previewDelta(s.keys,translate(dx,dy));}
  else if(s.k==='resize'){previewDelta(s.keys,resizeDelta(s.box,s.handle,p,e.shiftKey,e.altKey));}
  else if(s.k==='rotate'){const cx=s.box.x+s.box.w/2,cy=s.box.y+s.box.h/2;let a=(Math.atan2(p.y-cy,p.x-cx)-s.start)*180/Math.PI;if(e.shiftKey)a=Math.round(a/15)*15;previewDelta(s.keys,rotateAbout(a,cx,cy));}
  else if(s.k==='marquee'){setMarquee({x:Math.min(s.start.x,p.x),y:Math.min(s.start.y,p.y),w:Math.abs(p.x-s.start.x),h:Math.abs(p.y-s.start.y)});}
  else if(s.k==='shape'){setShapePrev({tool:s.tool,a:s.start,b:p,shift:e.shiftKey,alt:e.altKey});}
  else if(s.k==='pen-handle'&&draft){const m=C.keyToRoot(draft.parent);const lp=apply(invert(m),p.x,p.y);const n=s.node;if(Math.hypot(lp.x-n.x,lp.y-n.y)>2/ (zoom||1)){n.out={x:lp.x,y:lp.y};n.in={x:2*n.x-lp.x,y:2*n.y-lp.y};n.kind='symmetric';setDraft({...draft,nodes:[...draft.nodes]});}}
  else if(s.k==='node'){const lp=clientToLocal(s.key,e.clientX,e.clientY);setNodeDraft(prev=>{if(!prev)return prev;const cs=prev.map(c=>({closed:c.closed,nodes:c.nodes.map(n=>({...n}))}));const n=cs[s.c].nodes[s.i];
    if(s.part==='node'){const st=n;moveNode(st,lp.x-st.x,lp.y-st.y);}else moveHandle(n,s.part,lp,e.altKey);
    const dom=C.domEl(s.key);dom?.setAttribute('d',contoursToPath(cs));return cs;});}
 };
 const onUp=(e:React.PointerEvent)=>{
  const s=session.current;session.current=null;if(!s)return;try{wrap.current?.releasePointerCapture(e.pointerId);}catch{/* not captured */}
  const p=rootPt(e);
  if(s.k==='move'){if(!s.moved){return;}let dx=p.x-s.start.x,dy=p.y-s.start.y;if(e.shiftKey){if(Math.abs(dx)>Math.abs(dy))dy=0;else dx=0;}C.transformKeys(s.keys,translate(dx,dy));redraw();}
  else if(s.k==='resize'){C.transformKeys(s.keys,resizeDelta(s.box,s.handle,p,e.shiftKey,e.altKey));}
  else if(s.k==='rotate'){const cx=s.box.x+s.box.w/2,cy=s.box.y+s.box.h/2;let a=(Math.atan2(p.y-cy,p.x-cx)-s.start)*180/Math.PI;if(e.shiftKey)a=Math.round(a/15)*15;C.transformKeys(s.keys,rotateAbout(a,cx,cy));}
  else if(s.k==='marquee'){const r=marquee;setMarquee(null);if(r&&(r.w>2||r.h>2))marqueeSelect(r,s.additive);}
  else if(s.k==='shape'){setShapePrev(null);finishShape(s,p,e.shiftKey,e.altKey);}
  else if(s.k==='node'){const cs=nodeDraft;setNodeDraft(null);if(cs)C.setPathData(s.key,contoursToPath(cs));}
 };
 const marqueeSelect=(r:Box,additive:boolean)=>{const svg=C.view.svg;if(!svg)return;const found:string[]=[];
  svg.querySelectorAll('[data-sp]').forEach(el=>{const key=el.getAttribute('data-sp')!;if(!key)return;const sp=elementAt(root!,parsePathKey(key));if(!sp||!C.isLeaf(sp))return;
   if(el.closest('defs,clipPath,mask,pattern,symbol,marker,linearGradient,radialGradient,filter'))return;if(getComputedStyle(el).display==='none')return;
   const p=parsePathKey(key);for(let i=1;i<=p.length;i++)if(getUi().locked.includes(pathKey(p.slice(0,i))))return;
   const b=C.boxOfEl(el);if(b.w===0&&b.h===0)return;if(b.x<r.x+r.w&&b.x+b.w>r.x&&b.y<r.y+r.h&&b.y+b.h>r.y)found.push(key);});
  patchUi({selection:additive?[...new Set([...getUi().selection,...found])]:found.slice(0,500)});};
 const finishShape=(s:Extract<Session,{k:'shape'}>,p:Point,shift:boolean,alt:boolean)=>{
  const inv=invert(C.keyToRoot(s.parent));let a=apply(inv,s.start.x,s.start.y),b=apply(inv,p.x,p.y);
  const tiny=Math.hypot(p.x-s.start.x,p.y-s.start.y)*zoom<4;const def=Math.max(10,Math.round((display?.w??300)/6));
  if(tiny){if(s.tool==='line')b={x:a.x+def,y:a.y};else b={x:a.x+def,y:a.y+def};}
  else{if(shift&&s.tool!=='line'){const d=Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y));b={x:a.x+Math.sign(b.x-a.x||1)*d,y:a.y+Math.sign(b.y-a.y||1)*d};}
   if(alt&&s.tool!=='line'){const dx=b.x-a.x,dy=b.y-a.y;a={x:a.x-dx,y:a.y-dy};}}
  const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),w=Math.abs(b.x-a.x),h=Math.abs(b.y-a.y);
  const srcText=s.tool==='rect'?C.rectSrc(x,y,w,h):s.tool==='ellipse'?C.ellipseSrc(x+w/2,y+h/2,w/2,h/2):C.lineSrc(a.x,a.y,b.x,b.y);
  C.addElement(srcText,s.parent);patchUi({tool:'select'});};
 const finishPen=(parent:string,nodes:VectorNode[],closed:boolean)=>{
  const ns=nodes.map(n=>({...n}));if(ns.length<2){setDraft(null);return;}
  const d=serializeContour(ns,closed);setDraft(null);setHover(null);C.addElement(C.pathSrc(d,closed),parent);patchUi({tool:'node'});};
 const onDouble=(e:React.PointerEvent|React.MouseEvent)=>{
  const tool=getUi().tool;if(tool==='pen'&&draft){const nodes=draft.nodes.slice(0,-1);finishPen(draft.parent,nodes.length>=2?nodes:draft.nodes,false);return;}
  if(tool==='node'&&root&&getUi().selection.length===1){const key=getUi().selection[0];const el=elementAt(root,parsePathKey(key));if(!el)return;const cs=C.contoursOf(el);if(!cs)return;
   const lp=clientToLocal(key,e.clientX,e.clientY);const scale=Math.abs(M(C.domEl(key)?.getScreenCTM())[0])||1;let best:{c:number;seg:number;t:number;dist:number}|null=null;
   cs.forEach((c,ci)=>{const h=nearestOnContour(c,lp);if(h&&(!best||h.dist<best.dist))best={c:ci,seg:h.seg,t:h.t,dist:h.dist};});
   const b=best as {c:number;seg:number;t:number;dist:number}|null;if(b&&b.dist*scale<10){insertNode(cs[b.c],b.seg,b.t);C.setPathData(key,contoursToPath(cs));}return;}
  if(tool==='select'){const key=hitKey(e.target);const sp=key&&root?elementAt(root,parsePathKey(key)):null;if(sp&&sp.tag==='text'&&!sp.children.length){patchUi({selection:[key!]});setEditing({key:key!,value:C.textOf(sp,scanned.text)});}
   else if(sp&&sp.tag==='path'){patchUi({selection:[key!],tool:'node'});}}
 };

 // ---- keyboard ---------------------------------------------------------------------------------------------
 const onKey=(e:React.KeyboardEvent)=>{
  if(editing||(e.target as HTMLElement).tagName==='INPUT')return;const mod=e.metaKey||e.ctrlKey;const sel=getUi().selection;const handled=()=>{e.preventDefault();e.stopPropagation();};
  const tools:Record<string,Tool>={v:'select',a:'node',r:'rect',o:'ellipse',e:'ellipse',l:'line',p:'pen',t:'text'};
  if(!mod&&!e.altKey&&tools[e.key.toLowerCase()]&&e.key.length===1){patchUi({tool:tools[e.key.toLowerCase()]});handled();return;}
  if(e.key===' '){setSpaceDown(true);handled();return;}
  if(e.key==='Escape'){if(draft){setDraft(null);setHover(null);}else if(getUi().node)patchUi({node:null});else patchUi({selection:[],tool:getUi().tool==='select'?'select':'select'});handled();return;}
  if(e.key==='Enter'&&draft){finishPen(draft.parent,draft.nodes,false);handled();return;}
  if(e.key==='Delete'||e.key==='Backspace'){
   if(getUi().tool==='node'&&getUi().node&&sel.length===1&&root){const el=elementAt(root,parsePathKey(sel[0]));const cs=el&&C.contoursOf(el);const nn=getUi().node!;if(cs&&cs[nn.c]){if(deleteNode(cs[nn.c],nn.i)){patchUi({node:null});C.setPathData(sel[0],contoursToPath(cs));}else C.remove(sel);}handled();return;}
   if(sel.length){C.remove(sel);handled();}return;}
  if(mod&&e.key.toLowerCase()==='d'&&sel.length){C.duplicate(sel);handled();return;}
  if(mod&&e.key.toLowerCase()==='g'){if(e.shiftKey){sel.forEach(k=>C.ungroup(k));}else C.group(sel);handled();return;}
  if(mod&&e.key.toLowerCase()==='a'&&root){patchUi({selection:root.children.map((_,i)=>String(i))});handled();return;}
  if(mod&&(e.key==='0')){patchUi({fit:true});handled();return;}
  if(mod&&(e.key==='='||e.key==='+')){patchUi({zoom:Math.min(32,zoom*1.25),fit:false});handled();return;}
  if(mod&&e.key==='-'){patchUi({zoom:Math.max(0.05,zoom/1.25),fit:false});handled();return;}
  if(e.key==='['||e.key===']'){C.reorder(sel,e.key===']'?(e.altKey||mod?'front':'forward'):(e.altKey||mod?'back':'backward'));handled();return;}
  if(e.key.startsWith('Arrow')&&sel.length&&!mod){const st=e.shiftKey?10:1;const d={ArrowLeft:[-st,0],ArrowRight:[st,0],ArrowUp:[0,-st],ArrowDown:[0,st]}[e.key]!;C.transformKeys(sel,translate(d[0],d[1]));handled();return;}
 };
 const onKeyUp=(e:React.KeyboardEvent)=>{if(e.key===' ')setSpaceDown(false);};

 // ---- overlay ----------------------------------------------------------------------------------------------
 const accent='var(--accent,#7c5cff)';
 const wrapW=display?display.w*zoom+PAD*2:0,wrapH=display?display.h*zoom+PAD*2:0;
 const boxPx=(b:Box)=>{const a=toOv({x:b.x,y:b.y}),c=toOv({x:b.x+b.w,y:b.y+b.h});return{x:Math.min(a.x,c.x),y:Math.min(a.y,c.y),w:Math.abs(c.x-a.x),h:Math.abs(c.y-a.y)};};
 const topSel=C.topKeys(ui.selection).filter(k=>!!C.domEl(k));
 const singleBoxes=topSel.length>1?topSel.map(k=>C.boxOfKey(k)).filter((b):b is Box=>!!b):[];
 const ub=topSel.length?C.boxOfKeys(topSel):null;const ubPx=ub?boxPx(ub):null;
 const showHandles=ui.tool==='select'&&ubPx&&!session.current?.k.startsWith('pan');
 const handlePos=(h:Handle,b:{x:number;y:number;w:number;h:number})=>({x:b.x+(h.includes('w')?0:h.includes('e')?b.w:b.w/2),y:b.y+(h.includes('n')?0:h.includes('s')?b.h:b.h/2)});
 const nodeKey=ui.tool==='node'&&ui.selection.length===1?ui.selection[0]:null;
 const nodeEl=nodeKey&&root?elementAt(root,parsePathKey(nodeKey)):null;
 const contours=nodeEl?(nodeDraft??C.contoursOf(nodeEl)):null;
 const nodeMap=nodeKey?M(C.domEl(nodeKey)?.getScreenCTM()):null;const ori=origin();
 const lp2ov=(p:Point):Point=>{const c=apply(nodeMap!,p.x,p.y);return{x:c.x-ori.x,y:c.y-ori.y};};
 const draftPath=draft?(()=>{const m=C.keyToRoot(draft.parent);const pts=draft.nodes.map(n=>({...n,...toOv(apply(m,n.x,n.y)),in:n.in?toOv(apply(m,n.in.x,n.in.y)):undefined,out:n.out?toOv(apply(m,n.out.x,n.out.y)):undefined}));
  let d=`M${pts[0].x} ${pts[0].y}`;for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];d+=(a.out||b.in)?`C${(a.out??a).x} ${(a.out??a).y} ${(b.in??b).x} ${(b.in??b).y} ${b.x} ${b.y}`:`L${b.x} ${b.y}`;}
  if(hover){const a=pts[pts.length-1];const h=toOv(hover);d+=a.out?`C${a.out.x} ${a.out.y} ${h.x} ${h.y} ${h.x} ${h.y}`:`L${h.x} ${h.y}`;}return{d,pts};})():null;
 const cursor=spaceDown?'grab':ui.tool==='select'?'default':ui.tool==='node'?'default':'crosshair';
 const hs=7;

 if(error&&!display)return <section className="svg-editor" aria-label={t('svg.editor')}><SvgOptionsBar/><div className="grid flex-1 place-items-center p-6 text-center text-[12px] text-ink-3" role="alert">{error}</div></section>;
 return <section className="svg-editor" aria-label={t('svg.editor')}>
  <SvgOptionsBar/>
  <div ref={scroller} className="svg-stage" tabIndex={0} onKeyDown={onKey} onKeyUp={onKeyUp} data-testid="svg-stage" aria-label={t('svg.canvas')}>
   <div ref={wrap} className="svg-wrap" style={{width:wrapW,height:wrapH,padding:PAD,cursor}} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onDoubleClick={onDouble} onPointerLeave={()=>setCursor(null)}>
    <div ref={host} className="svg-host" data-testid="svg-host"/>
    <svg className="svg-overlay" width={wrapW} height={wrapH} aria-hidden="true">
     {singleBoxes.map((b,i)=>{const p=boxPx(b);return <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill="none" stroke={accent} strokeWidth={1} opacity={.6}/>;})}
     {ubPx&&ui.tool!=='node'&&<rect x={ubPx.x} y={ubPx.y} width={ubPx.w} height={ubPx.h} fill="none" stroke={accent} strokeWidth={1.5} data-testid="svg-selection"/>}
     {showHandles&&ubPx&&<>
      <line x1={ubPx.x+ubPx.w/2} y1={ubPx.y} x2={ubPx.x+ubPx.w/2} y2={ubPx.y-22} stroke={accent} strokeWidth={1}/>
      <circle data-h="rot" cx={ubPx.x+ubPx.w/2} cy={ubPx.y-22} r={5} fill="var(--bg-panel,#fff)" stroke={accent} strokeWidth={1.5} style={{pointerEvents:'all',cursor:'grab'}}/>
      {HANDLES.map(h=>{const p=handlePos(h,ubPx);const cur={nw:'nwse-resize',se:'nwse-resize',ne:'nesw-resize',sw:'nesw-resize',n:'ns-resize',s:'ns-resize',e:'ew-resize',w:'ew-resize'}[h];return <rect key={h} data-h={h} x={p.x-hs/2} y={p.y-hs/2} width={hs} height={hs} rx={1.5} fill="var(--bg-panel,#fff)" stroke={accent} strokeWidth={1.5} style={{pointerEvents:'all',cursor:cur}}/>;})}</>}
     {marquee&&(()=>{const p=boxPx(marquee);return <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={accent} fillOpacity={.08} stroke={accent} strokeDasharray="4 3"/>;})()}
     {shapePrev&&(()=>{const a=toOv(shapePrev.a),b=toOv(shapePrev.b);let x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),w=Math.abs(b.x-a.x),h=Math.abs(b.y-a.y);
      if(shapePrev.tool==='line')return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={accent} strokeWidth={1.5}/>;
      if(shapePrev.shift){const d=Math.max(w,h);w=d;h=d;if(b.x<a.x)x=a.x-d;if(b.y<a.y)y=a.y-d;}
      if(shapePrev.alt){x=a.x-w;y=a.y-h;w*=2;h*=2;}
      return shapePrev.tool==='rect'?<rect x={x} y={y} width={w} height={h} fill={accent} fillOpacity={.12} stroke={accent}/>:<ellipse cx={x+w/2} cy={y+h/2} rx={w/2} ry={h/2} fill={accent} fillOpacity={.12} stroke={accent}/>;})()}
     {draftPath&&<><path d={draftPath.d} fill="none" stroke={accent} strokeWidth={1.5}/>{draftPath.pts.map((p,i)=><g key={i}>{p.in&&<><line x1={p.x} y1={p.y} x2={p.in.x} y2={p.in.y} stroke={accent} strokeWidth={1}/><circle cx={p.in.x} cy={p.in.y} r={3} fill={accent}/></>}{p.out&&<><line x1={p.x} y1={p.y} x2={p.out.x} y2={p.out.y} stroke={accent} strokeWidth={1}/><circle cx={p.out.x} cy={p.out.y} r={3} fill={accent}/></>}<rect x={p.x-4} y={p.y-4} width={8} height={8} fill={i===0?accent:'var(--bg-panel,#fff)'} stroke={accent} strokeWidth={1.5}/></g>)}</>}
     {contours&&nodeMap&&contours.map((c,ci)=>{const ps=c.nodes.map(n=>({...n,...lp2ov(n),in:n.in?lp2ov(n.in):undefined,out:n.out?lp2ov(n.out):undefined}));
      return <g key={ci}><path d={(()=>{let d=`M${ps[0].x} ${ps[0].y}`;const cnt=c.closed?ps.length:ps.length-1;for(let i=0;i<cnt;i++){const a=ps[i],b=ps[(i+1)%ps.length];d+=(a.out||b.in)?`C${(a.out??a).x} ${(a.out??a).y} ${(b.in??b).x} ${(b.in??b).y} ${b.x} ${b.y}`:`L${b.x} ${b.y}`;}return d;})()} fill="none" stroke={accent} strokeWidth={1.25}/>
       {ps.map((p,i)=>{const picked=ui.node?.c===ci&&ui.node?.i===i;return <g key={i}>
        {picked&&p.in&&<><line x1={p.x} y1={p.y} x2={p.in.x} y2={p.in.y} stroke={accent} strokeWidth={1}/><circle data-n={`${ci}:${i}:in`} cx={p.in.x} cy={p.in.y} r={4} fill="var(--bg-panel,#fff)" stroke={accent} strokeWidth={1.5} style={{pointerEvents:'all',cursor:'move'}}/></>}
        {picked&&p.out&&<><line x1={p.x} y1={p.y} x2={p.out.x} y2={p.out.y} stroke={accent} strokeWidth={1}/><circle data-n={`${ci}:${i}:out`} cx={p.out.x} cy={p.out.y} r={4} fill="var(--bg-panel,#fff)" stroke={accent} strokeWidth={1.5} style={{pointerEvents:'all',cursor:'move'}}/></>}
        <rect data-n={`${ci}:${i}:node`} x={p.x-4.5} y={p.y-4.5} width={9} height={9} rx={p.kind==='corner'?1:4.5} fill={picked?accent:'var(--bg-panel,#fff)'} stroke={accent} strokeWidth={1.5} style={{pointerEvents:'all',cursor:'move'}}/></g>;})}</g>;})}
    </svg>
    {editing&&root&&(()=>{const b=C.boxOfKey(editing.key);if(!b)return null;const p=boxPx(b);return <input autoFocus className="svg-text-input" style={{left:p.x,top:p.y-2,minWidth:Math.max(80,p.w+16)}} aria-label={t('svg.textContent')} value={editing.value} onChange={e=>setEditing({...editing,value:e.target.value})} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter'){C.setTextContent(editing.key,editing.value);setEditing(null);scroller.current?.focus();}if(e.key==='Escape'){setEditing(null);scroller.current?.focus();}}} onBlur={()=>{if(editing){C.setTextContent(editing.key,editing.value);setEditing(null);}}}/>;})()}
   </div>
  </div>
  <SvgFooter size={display?{w:display.w,h:display.h}:null} zoom={zoom} onFit={()=>patchUi({fit:true})}/>
 </section>;
}
void mul;void pathToContours;void setKind;
