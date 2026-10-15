import {VectorExportSetup} from './VectorExportSetup';
import {useCallback,useEffect,useMemo,useRef,useState,type PointerEvent as RPointerEvent} from 'react';
import {PenNibIcon} from './icons';
import {StudioEmptyState} from '../studios/StudioEmptyState';
import {FileTabs} from '../FileTabs';
import {useT} from '../../lib/useT';
import {executeCommand} from '../../lib/commands';
import {serializeContour,type Point,type VectorNode,type VectorPath} from '../../lib/vectorio';
import {selectImage,deleteImage,updateImage,selectText,deleteText,duplicateText,updateText,selectNode,moveSelection,addNodeNear,addPath,commit,createBlankVector,deleteNode,deleteSelection,duplicateSelection,moveNode,openSvgSource,PAGE_PRESETS,redo,select,setTool,setView,undo,useVectorSession,type VectorTool} from '../../lib/vectorstudio/session';
import {boxOf,fitPath,hitDocument,pathBox,translatePath,type Box} from '../../lib/vectorstudio/geometry';
import {buildShape,newId,DEFAULT_SHAPE_STYLE,type ShapeKind} from '../../lib/vectorstudio/shapes';
import {openSvgDialog} from '../../lib/vectorstudio/open';
import {handleLocal,handlePoint,rotationFor,HANDLE_GAP_PX} from '../../lib/vectorstudio/textRotate';
import {selectionHandle,angleAround,centerOf,turnPoint} from '../../lib/vectorstudio/rotateHandle';
import {rotateSelection,selectionBounds} from '../../lib/vectorstudio/transforms';
import {PathLayer,GradientDefs,TextLayer,ImageLayer} from './render';
import {textBox,textTransform,unrotateAround,type VectorText} from '../../lib/vectorio';
import {togglePathSelection} from './tools/operations';
import {selectionSvg,pasteSvgText} from '../../lib/vectorstudio/clipboard';
import {studioContextStore} from '../../lib/shell/studioContext';
import {getVectorSession,subscribeVector} from '../../lib/vectorstudio/session';
import {VectorRulers,RULER_PX} from './VectorRulers';
import type {GuideAxis} from '../../lib/vectorstudio/guideOps';
import {VectorToolbar} from './VectorToolbar';

import {NativeSelect} from '../ui/native-controls';
type Drag=
 |{kind:'move';start:Point;dx:number;dy:number;guides?:{x:number[];y:number[]}}
 |{kind:'marquee';start:Point;cur:Point}
 |{kind:'scale';corner:number;from:Box;cur:Point}
 |{kind:'shape';tool:ShapeKind;start:Point;cur:Point}
 |{kind:'node';path:string;node:string;part:'anchor'|'in'|'out';cur:Point}
 |{kind:'text-move';id:string;start:Point;dx:number;dy:number}
 |{kind:'text-rotate';id:string;rotation:number}
 |{kind:'image-move';id:string;start:Point;dx:number;dy:number}
 |{kind:'sel-rotate';center:Point;handle:Point;deg:number}
 |{kind:'pan';sx:number;sy:number;pan:Point}
 |{kind:'pen-handle';cur:Point};
import {gridDelta,gridVisible,snapPointToGrid,snapValue} from '../../lib/vectorstudio/grid';
import {snapMove} from '../../lib/vectorstudio/snap';
const SHAPE_TOOLS:readonly string[]=['rect','ellipse','line','polygon','star'];
const CORNERS:readonly [number,number][]=[[0,0],[1,0],[1,1],[0,1]];

/** Canvas of the Vector Studio: start screen, or the drawing surface with select, node, pen and shape tools. */
export function VectorCanvas(){
 const {t}=useT();const s=useVectorSession();const ref=useRef<SVGSVGElement>(null);const wrap=useRef<HTMLDivElement>(null);
 const [drag,setDrag]=useState<Drag|null>(null);const [pen,setPen]=useState<VectorNode[]>([]);const [hover,setHover]=useState<Point|null>(null);
 const [presetId,setPresetId]=useState<string>(PAGE_PRESETS[0].id);
 const [gd,setGd]=useState<{axis:GuideAxis;from?:number;pos:number}|null>(null);const [box,setBox]=useState({w:1200,h:800});
 useEffect(()=>{const el=wrap.current;if(!el||typeof ResizeObserver==='undefined')return;const ro=new ResizeObserver(()=>setBox({w:el.clientWidth,h:el.clientHeight}));ro.observe(el);setBox({w:el.clientWidth,h:el.clientHeight});return()=>ro.disconnect();},[s.open]);
 const penRef=useRef<VectorNode[]>([]);penRef.current=pen;
 const toDoc=useCallback((e:{clientX:number;clientY:number}):Point=>{const r=ref.current!.getBoundingClientRect();return {x:(e.clientX-r.left-s.pan.x)/s.zoom,y:(e.clientY-r.top-s.pan.y)/s.zoom};},[s.pan.x,s.pan.y,s.zoom]);
 const tol=6/s.zoom;
 const fit=useCallback(()=>{const el=wrap.current;if(!el)return;const z=Math.min((el.clientWidth-80)/s.doc.width,(el.clientHeight-80)/s.doc.height);const zoom=Math.min(8,Math.max(0.05,z));
  setView(zoom,{x:(el.clientWidth-s.doc.width*zoom)/2,y:(el.clientHeight-s.doc.height*zoom)/2});},[s.doc.width,s.doc.height]);
 useEffect(()=>{if(s.open)fit();},[s.open,s.name,fit]);
 useEffect(()=>{setPen([]);},[s.tool,s.name]);
 useEffect(()=>{
  const owner=studioContextStore.claim('vector');
  const report=()=>{const v=getVectorSession();owner.report({document:v.open?{id:v.name,kind:'svg',dirty:v.dirty,readOnly:false}:undefined,
   activeTool:v.tool,selection:{kind:v.selection.length===0?'none':v.selection.length===1?'one':'many',type:'path',count:v.selection.length,ids:v.selection},
   services:{ready:v.open,node:!!(v.open&&v.tool==='node'&&v.nodePath&&v.selectedNode)},data:{width:v.doc.width,height:v.doc.height,nodePath:v.nodePath,selectedNode:v.selectedNode}});};
  report();const off=subscribeVector(report);return()=>{off();owner.release();};
 },[]);
 const finishPen=useCallback((close:boolean)=>{const nodes=penRef.current;if(nodes.length>=2){addPath({id:newId(),closed:close,name:close?'Shape':'Path',style:close?{...DEFAULT_SHAPE_STYLE}:{fill:'none',stroke:'#1f1b4d',strokeWidth:2,lineCap:'round',lineJoin:'round'},nodes});setTool('select');}setPen([]);},[]);

 const selected=s.doc.paths.filter(p=>s.selection.includes(p.id));
 // Live preview of an in-progress drag; committed as one undo step on pointer up.
 const shiftHeld=useRef(false);
 const rotatedById=useMemo(()=>{const m=new Map<string,VectorPath>();if(drag?.kind==='sel-rotate'&&drag.deg)for(const p of rotateSelection(s.doc,s.selection,drag.deg,drag.center).paths)m.set(p.id,p);return m;},[drag,s.doc,s.selection]);
 const preview=(p:VectorPath):VectorPath=>{
  if(!drag)return p;
  if(drag.kind==='sel-rotate')return rotatedById.get(p.id)??p;
  if(drag.kind==='move'&&s.selection.includes(p.id))return translatePath(p,drag.dx,drag.dy);
  if(drag.kind==='scale'&&s.selection.includes(p.id)){const to=scaledBox(drag,shiftHeld.current);return to?fitPath(p,drag.from,to):p;}
  if(drag.kind==='node'&&p.id===drag.path)return {...p,nodes:p.nodes.map(n=>n.id!==drag.node?n:moved(n,drag.part,drag.cur))};
  return p;};
 const paths=s.doc.paths.map(preview);
 const texts=(s.doc.texts??[]).map(t=>drag?.kind==='text-move'&&drag.id===t.id?{...t,x:t.x+drag.dx,y:t.y+drag.dy}:drag?.kind==='text-rotate'&&drag.id===t.id?{...t,rotation:drag.rotation}:t);
 const images=(s.doc.images??[]).map(i=>drag?.kind==='image-move'&&drag.id===i.id?{...i,x:i.x+drag.dx,y:i.y+drag.dy}:i);
 const selImage=images.find(i=>i.id===s.imageSel);
 const hitImage=(pt:Point):string|null=>{for(let i=images.length-1;i>=0;i--){const m=images[i];if(pt.x>=m.x-tol&&pt.x<=m.x+m.width+tol&&pt.y>=m.y-tol&&pt.y<=m.y+m.height+tol)return m.id;}return null;};
 const selText=texts.find(t=>t.id===s.textSel);const selTextBox=selText?textBox(selText):null;
 const hitText=(pt:Point,back=false):string|null=>{for(let i=texts.length-1;i>=0;i--){if(!!texts[i].back!==back)continue;const b=textBox(texts[i]),q=unrotateAround(texts[i],pt);if(q.x>=b.minX-tol&&q.x<=b.maxX+tol&&q.y>=b.minY-tol&&q.y<=b.maxY+tol)return texts[i].id;}return null;};
 const selBox=boxOf(selected.map(preview));

 const onDown=(e:RPointerEvent<SVGSVGElement>)=>{
  if(e.button===1||e.button===2){setDrag({kind:'pan',sx:e.clientX,sy:e.clientY,pan:s.pan});(e.target as Element).setPointerCapture?.(e.pointerId);return;}
  if(e.button!==0)return;wrap.current?.focus();(e.target as Element).setPointerCapture?.(e.pointerId);
  const raw=toDoc(e),pt=s.grid.snap&&(s.tool==='text'||SHAPE_TOOLS.includes(s.tool)||s.tool==='pen')?snapPointToGrid(raw,s.grid.size):raw;
  if(s.tool==='text'){const hit=hitText(pt)??hitText(pt,true);if(hit){selectText(hit);return;}void executeCommand('vector.addText',{x:Math.round(pt.x*100)/100,y:Math.round(pt.y*100)/100});setTool('select');return;}
  if(SHAPE_TOOLS.includes(s.tool)){setDrag({kind:'shape',tool:s.tool as ShapeKind,start:pt,cur:pt});return;}
  if(s.tool==='pen'){
   const first=pen[0];if(first&&pen.length>2&&Math.hypot(first.x-pt.x,first.y-pt.y)<=tol*1.5){finishPen(true);return;}
   setPen([...pen,{id:newId('n'),x:pt.x,y:pt.y,kind:'corner'}]);setDrag({kind:'pen-handle',cur:pt});return;}
  if(s.tool==='node'){
   const p=s.doc.paths.find(q=>q.id===s.nodePath);
   if(p){for(const n of p.nodes){for(const part of ['in','out'] as const){const h=n[part];if(h&&n.id===s.selectedNode&&Math.hypot(h.x-pt.x,h.y-pt.y)<=tol){setDrag({kind:'node',path:p.id,node:n.id,part,cur:pt});return;}}}
    const hitN=p.nodes.find(n=>Math.hypot(n.x-pt.x,n.y-pt.y)<=tol);if(hitN){select([p.id]);selectNode(hitN.id);setDrag({kind:'node',path:p.id,node:hitN.id,part:'anchor',cur:pt});return;}}
   const id=hitDocument(s.doc,pt,tol);if(id){select([id]);selectNode(null);}else if(!e.shiftKey)select([]);return;}
  // select tool
  if(selText&&Math.hypot(handlePoint(selText,s.zoom).x-pt.x,handlePoint(selText,s.zoom).y-pt.y)<=tol*1.2){setDrag({kind:'text-rotate',id:selText.id,rotation:selText.rotation??0});return;}
  {const hit=hitText(pt);if(hit){selectText(hit);setDrag({kind:'text-move',id:hit,start:pt,dx:0,dy:0});return;}}
  if(s.selection.length&&!s.textSel){const bnd=selectionBounds(s.doc,s.selection);if(bnd){const h=selectionHandle(bnd,s.zoom);if(Math.hypot(h.x-pt.x,h.y-pt.y)<=tol*1.2){setDrag({kind:'sel-rotate',center:centerOf(bnd),handle:h,deg:0});return;}}}
  const corner=selBox?cornerAt(selBox,pt,tol*1.4):-1;
  if(corner>=0&&selBox){setDrag({kind:'scale',corner,from:selBox,cur:pt});return;}
  const id=hitDocument(s.doc,pt,tol);
  if(id){const next=e.shiftKey?togglePathSelection(s.doc,s.selection,id,true):s.selection.includes(id)?s.selection:togglePathSelection(s.doc,s.selection,id);select(next);
   if(next.includes(id))setDrag({kind:'move',start:pt,dx:0,dy:0});return;}
  {const hit=hitText(pt,true);if(hit){selectText(hit);setDrag({kind:'text-move',id:hit,start:pt,dx:0,dy:0});return;}}
  {const hit=hitImage(pt);if(hit){selectImage(hit);setDrag({kind:'image-move',id:hit,start:pt,dx:0,dy:0});return;}}
  if(!e.shiftKey){select([]);selectText(null);selectImage(null);}setDrag({kind:'marquee',start:pt,cur:pt});};
 const onMove=(e:RPointerEvent<SVGSVGElement>)=>{
  const raw=toDoc(e),pt=s.grid.snap&&!e.altKey&&(drag?.kind==='shape'||drag?.kind==='scale'||drag?.kind==='node'||drag?.kind==='pen-handle'||(!drag&&s.tool==='pen'))?snapPointToGrid(raw,s.grid.size):raw;setHover(pt);if(!drag)return;
  if(drag.kind==='pan'){setView(s.zoom,{x:drag.pan.x+e.clientX-drag.sx,y:drag.pan.y+e.clientY-drag.sy});return;}
  if(drag.kind==='sel-rotate'){setDrag({...drag,deg:angleAround(drag.center,drag.handle,pt,e.shiftKey)});return;}
  if(drag.kind==='text-rotate'){const base=(s.doc.texts??[]).find(t=>t.id===drag.id);if(base)setDrag({...drag,rotation:rotationFor({...base,rotation:0},pt,s.zoom,e.shiftKey)});return;}
  if(drag.kind==='image-move'){const i0=(s.doc.images??[]).find(i=>i.id===drag.id),rx=raw.x-drag.start.x,ry=raw.y-drag.start.y;const g=s.grid.snap&&!e.altKey&&i0?{dx:snapValue(i0.x+rx,s.grid.size)-i0.x,dy:snapValue(i0.y+ry,s.grid.size)-i0.y}:null;setDrag({...drag,dx:g?g.dx:rx,dy:g?g.dy:ry});return;}
  if(drag.kind==='text-move'){const t0=(s.doc.texts??[]).find(t=>t.id===drag.id),rx=raw.x-drag.start.x,ry=raw.y-drag.start.y;const g=s.grid.snap&&!e.altKey&&t0?{dx:snapValue(t0.x+rx,s.grid.size)-t0.x,dy:snapValue(t0.y+ry,s.grid.size)-t0.y}:null;setDrag({...drag,dx:g?g.dx:rx,dy:g?g.dy:ry});return;}
  if(drag.kind==='move'){const snap=e.shiftKey?Math.abs(pt.x-drag.start.x)>Math.abs(pt.y-drag.start.y):null;
   const rx=snap===false?0:pt.x-drag.start.x,ry=snap===true?0:pt.y-drag.start.y;
   const base=boxOf(selected);
   if(base&&!e.altKey){const others=s.doc.paths.filter(q=>!q.hidden&&!s.selection.includes(q.id)).map(pathBox).filter((b):b is Box=>!!b);
    const r=snapMove(base,rx,ry,[{minX:0,minY:0,maxX:s.doc.width,maxY:s.doc.height},...(s.doc.guides?.x??[]).map(x=>({minX:x,maxX:x,minY:Infinity,maxY:Infinity})),...(s.doc.guides?.y??[]).map(y=>({minY:y,maxY:y,minX:Infinity,maxX:Infinity})),...others],SNAP_PX/s.zoom);
    const gd=s.grid.snap?gridDelta(base,rx,ry,s.grid.size):null;
    const dx=snap===false?0:gd&&!r.guides.x.length?gd.dx:r.dx,dy=snap===true?0:gd&&!r.guides.y.length?gd.dy:r.dy;
    setDrag({...drag,dx,dy,guides:r.guides});return;}
   setDrag({...drag,dx:rx,dy:ry,guides:undefined});return;}
  if(drag.kind==='pen-handle'){setDrag({kind:'pen-handle',cur:pt});
   setPen(nodes=>nodes.map((n,i)=>i!==nodes.length-1?n:{...n,kind:'smooth',out:pt,in:{x:n.x*2-pt.x,y:n.y*2-pt.y}}));return;}
  setDrag({...drag,cur:pt} as Drag);};
 const onUp=()=>{
  const d=drag;setDrag(null);if(!d)return;
  if(d.kind==='text-rotate'){const cur=(s.doc.texts??[]).find(t=>t.id===d.id);if(cur&&d.rotation!==(cur.rotation??0))updateText(d.id,{rotation:d.rotation});}
  else if(d.kind==='image-move'){if(d.dx||d.dy){const cur=(s.doc.images??[]).find(i=>i.id===d.id);if(cur)updateImage(d.id,{x:cur.x+d.dx,y:cur.y+d.dy});}}
  else if(d.kind==='text-move'){if(d.dx||d.dy){const cur=(s.doc.texts??[]).find(t=>t.id===d.id);if(cur)updateText(d.id,{x:cur.x+d.dx,y:cur.y+d.dy});}}
  else if(d.kind==='sel-rotate'){if(d.deg)commit(rotateSelection(s.doc,s.selection,d.deg,d.center));}
  else if(d.kind==='move'&&(d.dx||d.dy)){commit({...s.doc,paths:s.doc.paths.map(p=>s.selection.includes(p.id)?translatePath(p,d.dx,d.dy):p)});}
  else if(d.kind==='scale'){const to=scaledBox(d,shiftHeld.current);if(to)commit({...s.doc,paths:s.doc.paths.map(p=>s.selection.includes(p.id)?fitPath(p,d.from,to):p)});}
  else if(d.kind==='node'){moveNode(d.path,d.node,d.cur,d.part);}
  else if(d.kind==='marquee'){const b:Box={minX:Math.min(d.start.x,d.cur.x),minY:Math.min(d.start.y,d.cur.y),maxX:Math.max(d.start.x,d.cur.x),maxY:Math.max(d.start.y,d.cur.y)};
   if(b.maxX-b.minX>2||b.maxY-b.minY>2)select(s.doc.paths.filter(p=>{const pb=pathBox(p);return !p.hidden&&pb&&pb.minX>=b.minX&&pb.maxX<=b.maxX&&pb.minY>=b.minY&&pb.maxY<=b.maxY;}).map(p=>p.id));}
  else if(d.kind==='shape'){const tiny=Math.hypot(d.cur.x-d.start.x,d.cur.y-d.start.y)<3;
   const end=tiny?{x:d.start.x+(d.tool==='line'?120:100),y:d.start.y+(d.tool==='line'?0:100)}:d.cur;
   const from=d.tool==='line'||!shiftHeld.current?d.start:d.start;addPath(buildShape(d.tool,from,end,s.shapeOpts));setTool('select');}};
 const onDouble=(e:RPointerEvent<SVGSVGElement>|React.MouseEvent<SVGSVGElement>)=>{
  const pt=toDoc(e);
  if(s.tool==='pen'){finishPen(false);return;}
  if(s.tool==='node'&&s.nodePath){addNodeNear(s.nodePath,pt,tol*2);return;}
  if(s.tool==='select'){const id=hitDocument(s.doc,pt,tol);if(id){select([id]);setTool('node');}}};
 const onWheel=(e:React.WheelEvent)=>{
  if(e.ctrlKey||e.metaKey){const r=ref.current!.getBoundingClientRect();const mx=e.clientX-r.left,my=e.clientY-r.top;const z=Math.min(32,Math.max(0.05,s.zoom*Math.exp(-e.deltaY*0.0015)));
   setView(z,{x:mx-(mx-s.pan.x)/s.zoom*z,y:my-(my-s.pan.y)/s.zoom*z});}
  else setView(s.zoom,{x:s.pan.x-e.deltaX,y:s.pan.y-e.deltaY});};
 const guideAt=(axis:GuideAxis,e:{clientX:number;clientY:number})=>{const p=toDoc(e);return Math.round((axis==='x'?p.x:p.y)*1000)/1000;};
 const startGuide=(axis:GuideAxis,e:RPointerEvent,from?:number)=>{if(e.button!==0)return;e.stopPropagation();(e.currentTarget as Element).setPointerCapture?.(e.pointerId);setGd({axis,from,pos:guideAt(axis,e)});};
 const moveGuideDrag=(e:RPointerEvent)=>{if(gd)setGd({...gd,pos:guideAt(gd.axis,e)});};
 const endGuide=(e:RPointerEvent)=>{if(!gd)return;const r=wrap.current?.getBoundingClientRect(),g=gd;setGd(null);
  const inside=!!r&&e.clientX>r.left+RULER_PX&&e.clientX<r.right&&e.clientY>r.top+RULER_PX&&e.clientY<r.bottom;
  const to=inside?guideAt(g.axis,e):undefined;if(to===undefined&&g.from===undefined)return;if(to===g.from)return;
  void executeCommand('vector.moveGuide',{axis:g.axis,...(g.from!==undefined?{from:g.from}:{}),...(to!==undefined?{to}:{})});};
 const inField=(e:{target:EventTarget})=>{const tag=(e.target as HTMLElement).tagName;return tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT';};
 /* Clipboard access only through the browser's copy/cut/paste events (a user gesture); nothing reads the clipboard on its own. */
 const onCopy=(e:React.ClipboardEvent,cut:boolean)=>{if(inField(e))return;const g=getVectorSession(),svg=selectionSvg(g.doc,g.selection,g.textSel);if(!svg)return;e.preventDefault();e.clipboardData.setData('text/plain',svg);if(cut){if(g.selection.length)deleteSelection();else if(g.textSel)deleteText(g.textSel);}};
 const onPaste=(e:React.ClipboardEvent)=>{if(inField(e))return;const text=e.clipboardData.getData('text/plain');if(text&&pasteSvgText(text))e.preventDefault();};
 const onKey=(e:React.KeyboardEvent)=>{
  shiftHeld.current=e.shiftKey;const mod=e.ctrlKey||e.metaKey;const tag=(e.target as HTMLElement).tagName;if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return;
  if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
  if(mod&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}
  if(mod&&e.key.toLowerCase()==='d'){e.preventDefault();if(!s.selection.length&&s.textSel)duplicateText(s.textSel);else duplicateSelection();return;}
  if(mod&&e.altKey&&(e.code==='KeyC'||e.code==='KeyV')){e.preventDefault();void executeCommand(e.code==='KeyC'?'vector.copyStyle':'vector.pasteStyle');return;}
  if(mod&&e.key==='7'){e.preventDefault();void executeCommand(e.altKey?'vector.releaseClip':'vector.makeClip');return;}
  if(mod&&e.key.toLowerCase()==='g'){e.preventDefault();void executeCommand(e.shiftKey?'vector.ungroup':'vector.group');return;}
  if(mod&&e.key.toLowerCase()==='a'){e.preventDefault();select(s.doc.paths.filter(p=>!p.hidden).map(p=>p.id));return;}
  if(e.key==='Enter'&&s.tool==='pen'){e.preventDefault();finishPen(false);return;}
  if(e.key==='Escape'){if(pen.length){setPen([]);}else if(drag)setDrag(null);else{select([]);selectImage(null);}return;}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();if(s.tool==='node'&&s.nodePath&&s.selectedNode)deleteNode(s.nodePath,s.selectedNode);else if(s.textSel)deleteText(s.textSel);else if(s.imageSel)deleteImage(s.imageSel);else deleteSelection();return;}
  if(e.key.startsWith('Arrow')&&s.selection.length){e.preventDefault();const k=e.shiftKey?10:1;const dx=e.key==='ArrowLeft'?-k:e.key==='ArrowRight'?k:0,dy=e.key==='ArrowUp'?-k:e.key==='ArrowDown'?k:0;
   moveSelection(dx,dy);return;}
  if(!mod){const map:Record<string,VectorTool>={v:'select',a:'node',p:'pen',r:'rect',e:'ellipse',l:'line',g:'polygon',s:'star',t:'text'};const tool=map[e.key.toLowerCase()];if(tool){setTool(tool);}}};

 if(!s.open)return <main className="center" aria-label={t('vector.title')}><VectorExportSetup/><div className="workspace"><section className="code-pane" aria-label={t('vector.title')}><FileTabs/>
  <StudioEmptyState studio="vector" icon={<PenNibIcon/>} onOpen={()=>void openSvgDialog()} onCreate={()=>{const p=PAGE_PRESETS.find(x=>x.id===presetId)??PAGE_PRESETS[0];createBlankVector(p.width,p.height);}}
   extraActions={<label className="flex items-center gap-2 text-[12px] text-ink-2">{t('vector.start.pageSize')}
    <NativeSelect className="h-9 rounded-sm border border-line bg-elevated px-2 text-[12px] text-ink" value={presetId} onChange={e=>setPresetId(e.target.value)} data-testid="vector-start-preset">
     {PAGE_PRESETS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</NativeSelect></label>}/>
  {s.error&&<p role="alert" className="mx-auto max-w-[460px] p-3 text-[12px] text-danger" data-testid="vector-error">{s.error}</p>}
 </section></div></main>;

 const draft=drag?.kind==='shape'?buildShape(drag.tool,drag.start,drag.cur,s.shapeOpts):null;
 const nodePath=s.tool==='node'?paths.find(p=>p.id===s.nodePath):null;
 const penPath:VectorPath|null=pen.length?{id:'pen-draft',closed:false,nodes:hover&&drag?.kind!=='pen-handle'?[...pen,{id:'pen-ghost',x:hover.x,y:hover.y,kind:'corner'}]:pen,style:{fill:'none',stroke:'#2563eb',strokeWidth:1.5/s.zoom}}:null;
 return <main className="center" aria-label={t('vector.title')}><VectorExportSetup/><div className="workspace"><section className="code-pane" aria-label={t('vector.title')}>
  <FileTabs/><VectorToolbar onFit={fit}/>
  <div ref={wrap} tabIndex={0} onCopy={e=>onCopy(e,false)} onCut={e=>onCopy(e,true)} onPaste={onPaste} onKeyDown={onKey} onKeyUp={e=>{shiftHeld.current=e.shiftKey;}} onWheel={onWheel} className="relative min-h-0 flex-1 overflow-hidden bg-[color:var(--surface-2,#eef0f4)] outline-none" data-testid="vector-canvas" data-tool={s.tool}>
   <svg ref={ref} className="absolute inset-0 size-full touch-none select-none" style={{cursor:cursorFor(s.tool)}} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={()=>setDrag(null)} onDoubleClick={onDouble} onContextMenu={e=>e.preventDefault()} aria-label={t('vector.canvas')} role="img">
    <defs><GradientDefs gradients={s.doc.gradients}/><pattern id="vs-grid" width={s.grid.size} height={s.grid.size} patternUnits="userSpaceOnUse"><path d={`M ${s.grid.size} 0 L 0 0 0 ${s.grid.size}`} fill="none" stroke="rgba(37,99,235,.28)" strokeWidth={1/s.zoom}/></pattern><pattern id="vs-checker" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#fff"/><rect width="8" height="8" fill="#f1f2f5"/><rect x="8" y="8" width="8" height="8" fill="#f1f2f5"/></pattern></defs>
    <g transform={`translate(${s.pan.x} ${s.pan.y}) scale(${s.zoom})`}>
     <rect width={s.doc.width} height={s.doc.height} fill="url(#vs-checker)" stroke="rgba(0,0,0,.18)" strokeWidth={1/s.zoom}/>
     {gridVisible(s.grid,s.zoom)&&<rect data-testid="vector-grid" width={s.doc.width} height={s.doc.height} fill="url(#vs-grid)" pointerEvents="none"/>}
     <svg width={s.doc.width} height={s.doc.height} overflow="hidden" data-testid="vector-artboard"><ImageLayer images={images}/><TextLayer texts={texts.filter(t=>t.back)}/><PathLayer paths={paths} page={s.doc}/><TextLayer texts={texts.filter(t=>!t.back)}/>
      {draft&&<path d={serializeContour(draft.nodes,draft.closed)} fill={draft.closed?'rgba(109,94,245,.25)':'none'} stroke="#2563eb" strokeWidth={1.5/s.zoom}/>}</svg>
     {selected.map(p=>{const pp=preview(p);return <path key={p.id} d={serializeContour(pp.nodes,pp.closed)} fill="none" stroke="#2563eb" strokeWidth={1/s.zoom} pointerEvents="none"/>;})}
     {s.tool==='select'&&selBox&&<g data-testid="vector-selection"><rect x={selBox.minX} y={selBox.minY} width={selBox.maxX-selBox.minX} height={selBox.maxY-selBox.minY} fill="none" stroke="#2563eb" strokeWidth={1/s.zoom} strokeDasharray={`${4/s.zoom} ${3/s.zoom}`} pointerEvents="none"/>
      {CORNERS.map(([cx,cy],i)=><rect key={i} data-testid={`vector-handle-${i}`} x={(cx?selBox.maxX:selBox.minX)-4/s.zoom} y={(cy?selBox.maxY:selBox.minY)-4/s.zoom} width={8/s.zoom} height={8/s.zoom} fill="#fff" stroke="#2563eb" strokeWidth={1/s.zoom}/>)}</g>}
     {selImage&&<rect data-testid="vector-image-selection" x={selImage.x} y={selImage.y} width={selImage.width} height={selImage.height} fill="none" stroke="#2563eb" strokeWidth={1/s.zoom} strokeDasharray={`${4/s.zoom} ${3/s.zoom}`} pointerEvents="none"/>}
     {selTextBox&&<rect data-testid="vector-text-selection" transform={selText?textTransform(selText):undefined} x={selTextBox.minX} y={selTextBox.minY} width={selTextBox.maxX-selTextBox.minX} height={selTextBox.maxY-selTextBox.minY} fill="none" stroke="#2563eb" strokeWidth={1/s.zoom} strokeDasharray={`${4/s.zoom} ${3/s.zoom}`} pointerEvents="none"/>}
     {selBox&&!selText&&(!drag||drag.kind==='sel-rotate')&&(()=>{const bnd=selectionBounds(s.doc,s.selection);if(!bnd)return null;const c=centerOf(bnd),h0=selectionHandle(bnd,s.zoom),h=drag?.kind==='sel-rotate'?turnPoint(c,h0,drag.deg):h0;return <g pointerEvents="none"><line x1={drag?.kind==='sel-rotate'?c.x:h0.x} y1={drag?.kind==='sel-rotate'?c.y:h0.y+HANDLE_GAP_PX/s.zoom} x2={h.x} y2={h.y} stroke="#2563eb" strokeWidth={1/s.zoom}/><circle data-testid="vector-rotate-handle" cx={h.x} cy={h.y} r={5/s.zoom} fill="#fff" stroke="#2563eb" strokeWidth={1/s.zoom}/></g>;})()}
     {selText&&selTextBox&&<g transform={textTransform(selText)}><line x1={(selTextBox.minX+selTextBox.maxX)/2} y1={selTextBox.minY} x2={handleLocal(selText,s.zoom).x} y2={handleLocal(selText,s.zoom).y} stroke="#2563eb" strokeWidth={1/s.zoom} pointerEvents="none"/><circle data-testid="vector-text-rotate-handle" cx={handleLocal(selText,s.zoom).x} cy={handleLocal(selText,s.zoom).y} r={5/s.zoom} fill="#fff" stroke="#2563eb" strokeWidth={1/s.zoom} pointerEvents="none"/></g>}
     {nodePath&&<NodeOverlay path={nodePath} zoom={s.zoom} active={s.selectedNode}/>}
     {(['x','y'] as const).flatMap(axis=>(s.doc.guides?.[axis]??[]).map(v=><g key={axis+v} data-testid="vector-guide" data-axis={axis}>{!(gd&&gd.axis===axis&&gd.from===v)&&<line x1={axis==='x'?v:-1e5} x2={axis==='x'?v:1e5} y1={axis==='y'?v:-1e5} y2={axis==='y'?v:1e5} className="stroke-accent" strokeWidth={1/s.zoom} pointerEvents="none"/>}
      {s.tool==='select'&&<line x1={axis==='x'?v:-1e5} x2={axis==='x'?v:1e5} y1={axis==='y'?v:-1e5} y2={axis==='y'?v:1e5} stroke="transparent" strokeWidth={8/s.zoom} pointerEvents="stroke" className={axis==='x'?'cursor-col-resize':'cursor-row-resize'} onPointerDown={e=>startGuide(axis,e,v)} onPointerMove={moveGuideDrag} onPointerUp={endGuide} onPointerCancel={()=>setGd(null)}/>}</g>))}
     {gd&&<line data-testid="vector-guide-drag" x1={gd.axis==='x'?gd.pos:-1e5} x2={gd.axis==='x'?gd.pos:1e5} y1={gd.axis==='y'?gd.pos:-1e5} y2={gd.axis==='y'?gd.pos:1e5} className="stroke-accent" strokeWidth={1/s.zoom} strokeDasharray={`${4/s.zoom} ${3/s.zoom}`} pointerEvents="none"/>}
     {drag?.kind==='move'&&drag.guides&&<g data-testid="vector-snap-guides" pointerEvents="none">{drag.guides.x.map(x=><line key={'x'+x} x1={x} x2={x} y1={0} y2={s.doc.height} stroke="#e11d48" strokeWidth={1/s.zoom}/>)}{drag.guides.y.map(y=><line key={'y'+y} y1={y} y2={y} x1={0} x2={s.doc.width} stroke="#e11d48" strokeWidth={1/s.zoom}/>)}</g>}
     {drag?.kind==='marquee'&&<rect x={Math.min(drag.start.x,drag.cur.x)} y={Math.min(drag.start.y,drag.cur.y)} width={Math.abs(drag.cur.x-drag.start.x)} height={Math.abs(drag.cur.y-drag.start.y)} fill="rgba(37,99,235,.08)" stroke="#2563eb" strokeWidth={1/s.zoom} strokeDasharray={`${3/s.zoom}`}/>}
     {penPath&&<g pointerEvents="none"><path d={serializeContour(penPath.nodes,false)} fill="none" stroke="#2563eb" strokeWidth={1.5/s.zoom}/>{pen.map(n=><rect key={n.id} x={n.x-3.5/s.zoom} y={n.y-3.5/s.zoom} width={7/s.zoom} height={7/s.zoom} fill="#fff" stroke="#2563eb" strokeWidth={1/s.zoom}/>)}</g>}
    </g>
   </svg>
   <VectorRulers zoom={s.zoom} pan={s.pan} width={box.w} height={box.h} label={t('vector.shell.rulers')} onStart={(axis,e)=>startGuide(axis,e)} onMove={moveGuideDrag} onEnd={endGuide} onCancel={()=>setGd(null)}/>
  </div>
 </section></div></main>;

 function scaledBox(d:{corner:number;from:Box;cur:Point},shift:boolean):Box|null{
  const [cx,cy]=CORNERS[d.corner];const ax=cx?d.from.minX:d.from.maxX,ay=cy?d.from.minY:d.from.maxY;
  let x=d.cur.x,y=d.cur.y;if(shift){const w=d.from.maxX-d.from.minX||1,h=d.from.maxY-d.from.minY||1;const k=Math.max(Math.abs(x-ax)/w,Math.abs(y-ay)/h);x=ax+Math.sign(x-ax||1)*w*k;y=ay+Math.sign(y-ay||1)*h*k;}
  const b={minX:Math.min(ax,x),minY:Math.min(ay,y),maxX:Math.max(ax,x),maxY:Math.max(ay,y)};return b.maxX-b.minX<1||b.maxY-b.minY<1?null:b;}
}
function moved(n:VectorNode,part:'anchor'|'in'|'out',to:Point):VectorNode{
 if(part==='anchor'){const dx=to.x-n.x,dy=to.y-n.y;return {...n,x:to.x,y:to.y,...(n.in?{in:{x:n.in.x+dx,y:n.in.y+dy}}:{}),...(n.out?{out:{x:n.out.x+dx,y:n.out.y+dy}}:{})};}
 return {...n,[part]:to};}
function cornerAt(b:Box,pt:Point,r:number):number{return CORNERS.findIndex(([cx,cy])=>Math.hypot((cx?b.maxX:b.minX)-pt.x,(cy?b.maxY:b.minY)-pt.y)<=r);}
const SNAP_PX=6;
const cursorFor=(t:VectorTool)=>t==='select'?'default':t==='node'?'crosshair':'crosshair';
function NodeOverlay({path,zoom,active}:{path:VectorPath;zoom:number;active:string|null}){
 const k=1/zoom;
 return <g data-testid="vector-node-overlay">
  {path.nodes.map(n=><g key={n.id}>
   {n.id===active&&[n.in,n.out].map((h,i)=>h&&<g key={i}><line x1={n.x} y1={n.y} x2={h.x} y2={h.y} stroke="#2563eb" strokeWidth={k}/><circle cx={h.x} cy={h.y} r={3.5*k} fill="#fff" stroke="#2563eb" strokeWidth={k}/></g>)}
   <rect data-node-id={n.id} x={n.x-4*k} y={n.y-4*k} width={8*k} height={8*k} fill={n.id===active?'#2563eb':'#fff'} stroke="#2563eb" strokeWidth={k}/></g>)}</g>;}
