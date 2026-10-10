import {useCallback,useEffect,useRef,useState,type PointerEvent as RPointerEvent} from 'react';
import {PenNibIcon} from './icons';
import {StudioEmptyState} from '../studios/StudioEmptyState';
import {FileTabs} from '../FileTabs';
import {useT} from '../../lib/useT';
import {serializeContour,type Point,type VectorNode,type VectorPath} from '../../lib/vectorio';
import {getState,patchState} from '../../store/appStore';
import {selectNode,moveSelection,addNodeNear,addPath,commit,createBlankVector,deleteNode,deleteSelection,duplicateSelection,moveNode,openSvgSource,PAGE_PRESETS,redo,select,setTool,setView,undo,useVectorSession,type VectorTool} from '../../lib/vectorstudio/session';
import {boxOf,fitPath,hitDocument,pathBox,translatePath,type Box} from '../../lib/vectorstudio/geometry';
import {buildShape,newId,DEFAULT_SHAPE_STYLE,type ShapeKind} from '../../lib/vectorstudio/shapes';
import {openSvgDialog} from '../../lib/vectorstudio/open';
import {PathLayer} from './render';
import {togglePathSelection} from './tools/operations';
import {VectorToolbar} from './VectorToolbar';

type Drag=
 |{kind:'move';start:Point;dx:number;dy:number}
 |{kind:'marquee';start:Point;cur:Point}
 |{kind:'scale';corner:number;from:Box;cur:Point}
 |{kind:'shape';tool:ShapeKind;start:Point;cur:Point}
 |{kind:'node';path:string;node:string;part:'anchor'|'in'|'out';cur:Point}
 |{kind:'pan';sx:number;sy:number;pan:Point}
 |{kind:'pen-handle';cur:Point};
const SHAPE_TOOLS:readonly string[]=['rect','ellipse','line','polygon','star'];
const CORNERS:readonly [number,number][]=[[0,0],[1,0],[1,1],[0,1]];

/** Canvas of the Vector Studio: start screen, or the drawing surface with select, node, pen and shape tools. */
export function VectorCanvas(){
 const {t}=useT();const s=useVectorSession();const ref=useRef<SVGSVGElement>(null);const wrap=useRef<HTMLDivElement>(null);
 const [drag,setDrag]=useState<Drag|null>(null);const [pen,setPen]=useState<VectorNode[]>([]);const [hover,setHover]=useState<Point|null>(null);
 const [presetId,setPresetId]=useState<string>(PAGE_PRESETS[0].id);
 const penRef=useRef<VectorNode[]>([]);penRef.current=pen;
 const toDoc=useCallback((e:{clientX:number;clientY:number}):Point=>{const r=ref.current!.getBoundingClientRect();return {x:(e.clientX-r.left-s.pan.x)/s.zoom,y:(e.clientY-r.top-s.pan.y)/s.zoom};},[s.pan.x,s.pan.y,s.zoom]);
 const tol=6/s.zoom;
 const fit=useCallback(()=>{const el=wrap.current;if(!el)return;const z=Math.min((el.clientWidth-80)/s.doc.width,(el.clientHeight-80)/s.doc.height);const zoom=Math.min(8,Math.max(0.05,z));
  setView(zoom,{x:(el.clientWidth-s.doc.width*zoom)/2,y:(el.clientHeight-s.doc.height*zoom)/2});},[s.doc.width,s.doc.height]);
 useEffect(()=>{if(s.open)fit();},[s.open,s.name,fit]);
 useEffect(()=>{setPen([]);},[s.tool,s.name]);
 // The Vector rail offers Files only, so do not leave the HTML Layers tree open beside the drawing.
 useEffect(()=>{if(!['files','search'].includes(getState().leftTab))patchState({leftTab:'files'});},[]);
 const finishPen=useCallback((close:boolean)=>{const nodes=penRef.current;if(nodes.length>=2){addPath({id:newId(),closed:close,name:close?'Shape':'Path',style:close?{...DEFAULT_SHAPE_STYLE}:{fill:'none',stroke:'#1f1b4d',strokeWidth:2,lineCap:'round',lineJoin:'round'},nodes});setTool('select');}setPen([]);},[]);

 const selected=s.doc.paths.filter(p=>s.selection.includes(p.id));
 // Live preview of an in-progress drag; committed as one undo step on pointer up.
 const shiftHeld=useRef(false);
 const preview=(p:VectorPath):VectorPath=>{
  if(!drag)return p;
  if(drag.kind==='move'&&s.selection.includes(p.id))return translatePath(p,drag.dx,drag.dy);
  if(drag.kind==='scale'&&s.selection.includes(p.id)){const to=scaledBox(drag,shiftHeld.current);return to?fitPath(p,drag.from,to):p;}
  if(drag.kind==='node'&&p.id===drag.path)return {...p,nodes:p.nodes.map(n=>n.id!==drag.node?n:moved(n,drag.part,drag.cur))};
  return p;};
 const paths=s.doc.paths.map(preview);
 const selBox=boxOf(selected.map(preview));

 const onDown=(e:RPointerEvent<SVGSVGElement>)=>{
  if(e.button===1||e.button===2){setDrag({kind:'pan',sx:e.clientX,sy:e.clientY,pan:s.pan});(e.target as Element).setPointerCapture?.(e.pointerId);return;}
  if(e.button!==0)return;wrap.current?.focus();(e.target as Element).setPointerCapture?.(e.pointerId);
  const pt=toDoc(e);
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
  const corner=selBox?cornerAt(selBox,pt,tol*1.4):-1;
  if(corner>=0&&selBox){setDrag({kind:'scale',corner,from:selBox,cur:pt});return;}
  const id=hitDocument(s.doc,pt,tol);
  if(id){const next=e.shiftKey?togglePathSelection(s.doc,s.selection,id,true):s.selection.includes(id)?s.selection:togglePathSelection(s.doc,s.selection,id);select(next);
   if(next.includes(id))setDrag({kind:'move',start:pt,dx:0,dy:0});return;}
  if(!e.shiftKey)select([]);setDrag({kind:'marquee',start:pt,cur:pt});};
 const onMove=(e:RPointerEvent<SVGSVGElement>)=>{
  const pt=toDoc(e);setHover(pt);if(!drag)return;
  if(drag.kind==='pan'){setView(s.zoom,{x:drag.pan.x+e.clientX-drag.sx,y:drag.pan.y+e.clientY-drag.sy});return;}
  if(drag.kind==='move'){const snap=e.shiftKey?Math.abs(pt.x-drag.start.x)>Math.abs(pt.y-drag.start.y):null;
   setDrag({...drag,dx:snap===false?0:pt.x-drag.start.x,dy:snap===true?0:pt.y-drag.start.y});return;}
  if(drag.kind==='pen-handle'){setDrag({kind:'pen-handle',cur:pt});
   setPen(nodes=>nodes.map((n,i)=>i!==nodes.length-1?n:{...n,kind:'smooth',out:pt,in:{x:n.x*2-pt.x,y:n.y*2-pt.y}}));return;}
  setDrag({...drag,cur:pt} as Drag);};
 const onUp=()=>{
  const d=drag;setDrag(null);if(!d)return;
  if(d.kind==='move'&&(d.dx||d.dy)){commit({...s.doc,paths:s.doc.paths.map(p=>s.selection.includes(p.id)?translatePath(p,d.dx,d.dy):p)});}
  else if(d.kind==='scale'){const to=scaledBox(d,shiftHeld.current);if(to)commit({...s.doc,paths:s.doc.paths.map(p=>s.selection.includes(p.id)?fitPath(p,d.from,to):p)});}
  else if(d.kind==='node'){moveNode(d.path,d.node,d.cur,d.part);}
  else if(d.kind==='marquee'){const b:Box={minX:Math.min(d.start.x,d.cur.x),minY:Math.min(d.start.y,d.cur.y),maxX:Math.max(d.start.x,d.cur.x),maxY:Math.max(d.start.y,d.cur.y)};
   if(b.maxX-b.minX>2||b.maxY-b.minY>2)select(s.doc.paths.filter(p=>{const pb=pathBox(p);return !p.hidden&&pb&&pb.minX>=b.minX&&pb.maxX<=b.maxX&&pb.minY>=b.minY&&pb.maxY<=b.maxY;}).map(p=>p.id));}
  else if(d.kind==='shape'){const tiny=Math.hypot(d.cur.x-d.start.x,d.cur.y-d.start.y)<3;
   const end=tiny?{x:d.start.x+(d.tool==='line'?120:100),y:d.start.y+(d.tool==='line'?0:100)}:d.cur;
   const from=d.tool==='line'||!shiftHeld.current?d.start:d.start;addPath(buildShape(d.tool,from,end));setTool('select');}};
 const onDouble=(e:RPointerEvent<SVGSVGElement>|React.MouseEvent<SVGSVGElement>)=>{
  const pt=toDoc(e);
  if(s.tool==='pen'){finishPen(false);return;}
  if(s.tool==='node'&&s.nodePath){addNodeNear(s.nodePath,pt,tol*2);return;}
  if(s.tool==='select'){const id=hitDocument(s.doc,pt,tol);if(id){select([id]);setTool('node');}}};
 const onWheel=(e:React.WheelEvent)=>{
  if(e.ctrlKey||e.metaKey){const r=ref.current!.getBoundingClientRect();const mx=e.clientX-r.left,my=e.clientY-r.top;const z=Math.min(32,Math.max(0.05,s.zoom*Math.exp(-e.deltaY*0.0015)));
   setView(z,{x:mx-(mx-s.pan.x)/s.zoom*z,y:my-(my-s.pan.y)/s.zoom*z});}
  else setView(s.zoom,{x:s.pan.x-e.deltaX,y:s.pan.y-e.deltaY});};
 const onKey=(e:React.KeyboardEvent)=>{
  shiftHeld.current=e.shiftKey;const mod=e.ctrlKey||e.metaKey;const tag=(e.target as HTMLElement).tagName;if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return;
  if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
  if(mod&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}
  if(mod&&e.key.toLowerCase()==='d'){e.preventDefault();duplicateSelection();return;}
  if(mod&&e.key.toLowerCase()==='a'){e.preventDefault();select(s.doc.paths.filter(p=>!p.hidden).map(p=>p.id));return;}
  if(e.key==='Enter'&&s.tool==='pen'){e.preventDefault();finishPen(false);return;}
  if(e.key==='Escape'){if(pen.length){setPen([]);}else if(drag)setDrag(null);else select([]);return;}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();if(s.tool==='node'&&s.nodePath&&s.selectedNode)deleteNode(s.nodePath,s.selectedNode);else deleteSelection();return;}
  if(e.key.startsWith('Arrow')&&s.selection.length){e.preventDefault();const k=e.shiftKey?10:1;const dx=e.key==='ArrowLeft'?-k:e.key==='ArrowRight'?k:0,dy=e.key==='ArrowUp'?-k:e.key==='ArrowDown'?k:0;
   moveSelection(dx,dy);return;}
  if(!mod){const map:Record<string,VectorTool>={v:'select',a:'node',p:'pen',r:'rect',e:'ellipse',l:'line',g:'polygon',s:'star'};const tool=map[e.key.toLowerCase()];if(tool){setTool(tool);}}};

 if(!s.open)return <main className="center" aria-label={t('vector.title')}><div className="workspace"><section className="code-pane" aria-label={t('vector.title')}><FileTabs/>
  <StudioEmptyState studio="vector" icon={<PenNibIcon/>} onOpen={()=>void openSvgDialog()} onCreate={()=>{const p=PAGE_PRESETS.find(x=>x.id===presetId)??PAGE_PRESETS[0];createBlankVector(p.width,p.height);}}
   extraActions={<label className="flex items-center gap-2 text-[12px] text-ink-2">{t('vector.start.pageSize')}
    <select className="h-9 rounded-sm border border-line bg-elevated px-2 text-[12px] text-ink" value={presetId} onChange={e=>setPresetId(e.target.value)} data-testid="vector-start-preset">
     {PAGE_PRESETS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>}/>
  {s.error&&<p role="alert" className="mx-auto max-w-[460px] p-3 text-[12px] text-danger" data-testid="vector-error">{s.error}</p>}
 </section></div></main>;

 const draft=drag?.kind==='shape'?buildShape(drag.tool,drag.start,drag.cur):null;
 const nodePath=s.tool==='node'?paths.find(p=>p.id===s.nodePath):null;
 const penPath:VectorPath|null=pen.length?{id:'pen-draft',closed:false,nodes:hover&&drag?.kind!=='pen-handle'?[...pen,{id:'pen-ghost',x:hover.x,y:hover.y,kind:'corner'}]:pen,style:{fill:'none',stroke:'#2563eb',strokeWidth:1.5/s.zoom}}:null;
 return <main className="center" aria-label={t('vector.title')}><div className="workspace"><section className="code-pane" aria-label={t('vector.title')}>
  <FileTabs/><VectorToolbar onFit={fit}/>
  <div ref={wrap} tabIndex={0} onKeyDown={onKey} onKeyUp={e=>{shiftHeld.current=e.shiftKey;}} onWheel={onWheel} className="relative min-h-0 flex-1 overflow-hidden bg-[color:var(--surface-2,#eef0f4)] outline-none" data-testid="vector-canvas" data-tool={s.tool}>
   <svg ref={ref} className="absolute inset-0 size-full touch-none select-none" style={{cursor:cursorFor(s.tool)}} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={()=>setDrag(null)} onDoubleClick={onDouble} onContextMenu={e=>e.preventDefault()} aria-label={t('vector.canvas')} role="img">
    <defs><pattern id="vs-checker" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#fff"/><rect width="8" height="8" fill="#f1f2f5"/><rect x="8" y="8" width="8" height="8" fill="#f1f2f5"/></pattern></defs>
    <g transform={`translate(${s.pan.x} ${s.pan.y}) scale(${s.zoom})`}>
     <rect width={s.doc.width} height={s.doc.height} fill="url(#vs-checker)" stroke="rgba(0,0,0,.18)" strokeWidth={1/s.zoom}/>
     <svg width={s.doc.width} height={s.doc.height} overflow="hidden" data-testid="vector-artboard"><PathLayer paths={paths}/>
      {draft&&<path d={serializeContour(draft.nodes,draft.closed)} fill={draft.closed?'rgba(109,94,245,.25)':'none'} stroke="#2563eb" strokeWidth={1.5/s.zoom}/>}</svg>
     {selected.map(p=>{const pp=preview(p);return <path key={p.id} d={serializeContour(pp.nodes,pp.closed)} fill="none" stroke="#2563eb" strokeWidth={1/s.zoom} pointerEvents="none"/>;})}
     {s.tool==='select'&&selBox&&<g data-testid="vector-selection"><rect x={selBox.minX} y={selBox.minY} width={selBox.maxX-selBox.minX} height={selBox.maxY-selBox.minY} fill="none" stroke="#2563eb" strokeWidth={1/s.zoom} strokeDasharray={`${4/s.zoom} ${3/s.zoom}`} pointerEvents="none"/>
      {CORNERS.map(([cx,cy],i)=><rect key={i} data-testid={`vector-handle-${i}`} x={(cx?selBox.maxX:selBox.minX)-4/s.zoom} y={(cy?selBox.maxY:selBox.minY)-4/s.zoom} width={8/s.zoom} height={8/s.zoom} fill="#fff" stroke="#2563eb" strokeWidth={1/s.zoom}/>)}</g>}
     {nodePath&&<NodeOverlay path={nodePath} zoom={s.zoom} active={s.selectedNode}/>}
     {drag?.kind==='marquee'&&<rect x={Math.min(drag.start.x,drag.cur.x)} y={Math.min(drag.start.y,drag.cur.y)} width={Math.abs(drag.cur.x-drag.start.x)} height={Math.abs(drag.cur.y-drag.start.y)} fill="rgba(37,99,235,.08)" stroke="#2563eb" strokeWidth={1/s.zoom} strokeDasharray={`${3/s.zoom}`}/>}
     {penPath&&<g pointerEvents="none"><path d={serializeContour(penPath.nodes,false)} fill="none" stroke="#2563eb" strokeWidth={1.5/s.zoom}/>{pen.map(n=><rect key={n.id} x={n.x-3.5/s.zoom} y={n.y-3.5/s.zoom} width={7/s.zoom} height={7/s.zoom} fill="#fff" stroke="#2563eb" strokeWidth={1/s.zoom}/>)}</g>}
    </g>
   </svg>
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
const cursorFor=(t:VectorTool)=>t==='select'?'default':t==='node'?'crosshair':'crosshair';
function NodeOverlay({path,zoom,active}:{path:VectorPath;zoom:number;active:string|null}){
 const k=1/zoom;
 return <g data-testid="vector-node-overlay">
  {path.nodes.map(n=><g key={n.id}>
   {n.id===active&&[n.in,n.out].map((h,i)=>h&&<g key={i}><line x1={n.x} y1={n.y} x2={h.x} y2={h.y} stroke="#2563eb" strokeWidth={k}/><circle cx={h.x} cy={h.y} r={3.5*k} fill="#fff" stroke="#2563eb" strokeWidth={k}/></g>)}
   <rect data-node-id={n.id} x={n.x-4*k} y={n.y-4*k} width={8*k} height={8*k} fill={n.id===active?'#2563eb':'#fff'} stroke="#2563eb" strokeWidth={k}/></g>)}</g>;}
