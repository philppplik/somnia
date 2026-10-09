import {useRef} from 'react';
import {booleanOp,booleanable,type BoolOp} from '../../lib/svgedit/booleans';
import {traceImage,isTraceable,placeImage,DEFAULT_TRACE} from '../../lib/svgedit/trace';
import {useState} from 'react';
import {canClip,makeClip,clipInfo,releaseClip} from '../../lib/svgedit/clip';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {useSvgUi,patchUi} from '../../lib/svgedit/store';
import * as C from '../../lib/svgedit/controller';
import {elementAt,parsePathKey} from '../../lib/svgedit/source';
import {pathToContours,contoursToPath,setKind} from '../../lib/svgedit/pathnodes';
import {attr} from '../../lib/svgedit/source';
import type {AlignKind} from '../../lib/svgedit/geometry';
import {AlignStartVertical,AlignCenterVertical,AlignEndVertical,AlignStartHorizontal,AlignCenterHorizontal,AlignEndHorizontal,ArrowUpToLine,ArrowDownToLine,ArrowUp,ArrowDown,ArrowLeftRight,ArrowUpDown,RotateCw,RotateCcw,Container,SquareDashed,Image as ImageIcon,PencilLine,Minus} from '../../lib/icons';
const BoolGlyph=({op}:{op:BoolOp})=><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><defs><clipPath id={`bc-${op}`}><rect x="6" y="6" width="8" height="8" rx="1"/></clipPath></defs>{op==='unite'&&<path d="M2 2h8v4h4v8H6v-4H2z" fill="currentColor" fillOpacity=".25"/>}{op==='subtract'&&<><path d="M2 2h8v4H6v4H2z" fill="currentColor" fillOpacity=".25"/><path d="M6 6h8v8H6z" strokeDasharray="2 2"/></>}{op==='intersect'&&<><rect x="2" y="2" width="8" height="8" rx="1" strokeDasharray="2 2"/><rect x="6" y="6" width="8" height="8" rx="1" strokeDasharray="2 2"/><rect x="6" y="6" width="4" height="4" fill="currentColor" fillOpacity=".35"/></>}{op==='exclude'&&<><path d="M2 2h8v4H6v4H2z" fill="currentColor" fillOpacity=".25"/><path d="M10 6h4v8H6v-4h4z" fill="currentColor" fillOpacity=".25"/></>}</svg>;
const ClipGlyph=({kind}:{kind:'clip'|'mask'|'release'|'snap'})=><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
 {kind==='clip'&&<><rect x="1.5" y="1.5" width="9" height="9" rx="1" strokeDasharray="2 2"/><circle cx="9.5" cy="9.5" r="4.5" fill="currentColor" fillOpacity=".25"/></>}
 {kind==='mask'&&<><rect x="1.5" y="1.5" width="13" height="13" rx="1.5"/><path d="M2 14L14 2" strokeWidth="2.2" strokeOpacity=".5"/><circle cx="8" cy="8" r="3" fill="currentColor" fillOpacity=".4"/></>}
 {kind==='release'&&<><circle cx="8" cy="8" r="5" strokeDasharray="2.2 2"/><path d="M5.5 8h5M8.5 6l2 2-2 2"/></>}
 {kind==='snap'&&<><path d="M3 2v6a5 5 0 0010 0V2"/><path d="M3 5h3M10 5h3"/></>}</svg>;
const Sep=()=><span className="mx-1 h-4 w-px bg-[var(--border-subtle)]" aria-hidden="true"/>;
export function SvgOptionsBar(){
 const {t}=useT();const ui=useSvgUi();const sel=ui.selection;const has=sel.length>0;const {root}=C.scan();
 const one=sel.length===1&&root?elementAt(root,parsePathKey(sel[0])):null;
 const btn=(label:string,icon:React.ReactNode,on:()=>void,disabled=false,pressed?:boolean)=><Button size="icon" className="!size-7" aria-label={label} title={label} disabled={disabled} aria-pressed={pressed} onClick={on}>{icon}</Button>;
 const al=(k:AlignKind,label:string,icon:React.ReactNode)=>btn(label,icon,()=>C.align(sel,k),!has);
 const nodeEdit=(fn:(cs:ReturnType<typeof pathToContours>&object,c:number,i:number)=>void)=>{if(!one||one.tag!=='path'||!ui.node)return;const cs=pathToContours(attr(one,'d')??'');if(!cs)return;fn(cs,ui.node.c,ui.node.i);C.setPathData(sel[0],contoursToPath(cs));};
 const file=useRef<HTMLInputElement>(null);const [tr,setTr]=useState(DEFAULT_TRACE);const [busy,setBusy]=useState(false);
 const canBool=sel.length>=2&&!!root&&sel.every(k=>{const e=elementAt(root,parsePathKey(k));return !!e&&booleanable(e);});
 const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);try{await fn();}finally{setBusy(false);}};
 return <div className="svg-options" role="toolbar" aria-label={t('svg.options')} data-testid="svg-options">
  {al('left',t('svg.alignLeft'),<AlignStartVertical size={15}/>)}{al('hcenter',t('svg.alignCenter'),<AlignCenterVertical size={15}/>)}{al('right',t('svg.alignRight'),<AlignEndVertical size={15}/>)}
  {al('top',t('svg.alignTop'),<AlignStartHorizontal size={15}/>)}{al('vcenter',t('svg.alignMiddle'),<AlignCenterHorizontal size={15}/>)}{al('bottom',t('svg.alignBottom'),<AlignEndHorizontal size={15}/>)}
  <Sep/>
  {btn(t('svg.toFront'),<ArrowUpToLine size={15}/>,()=>C.reorder(sel,'front'),!has)}{btn(t('svg.forward'),<ArrowUp size={15}/>,()=>C.reorder(sel,'forward'),!has)}{btn(t('svg.backward'),<ArrowDown size={15}/>,()=>C.reorder(sel,'backward'),!has)}{btn(t('svg.toBack'),<ArrowDownToLine size={15}/>,()=>C.reorder(sel,'back'),!has)}
  <Sep/>
  {btn(t('svg.rotateLeft'),<RotateCcw size={15}/>,()=>C.rotateSel(sel,-90),!has)}{btn(t('svg.rotateRight'),<RotateCw size={15}/>,()=>C.rotateSel(sel,90),!has)}{btn(t('svg.flipH'),<ArrowLeftRight size={15}/>,()=>C.flipSel(sel,'h'),!has)}{btn(t('svg.flipV'),<ArrowUpDown size={15}/>,()=>C.flipSel(sel,'v'),!has)}
  <Sep/>
  {btn(t('svg.group'),<Container size={15}/>,()=>C.group(sel),!has)}{btn(t('svg.ungroup'),<SquareDashed size={15}/>,()=>sel.forEach(k=>C.ungroup(k)),!one||one.tag!=='g')}
  {btn(t('svg.toPath'),<PencilLine size={15}/>,()=>sel.forEach(k=>C.convertToPath(k)),!one||!C.convertible(one))}
  <Sep/>
  {(['unite','subtract','intersect','exclude'] as const).map(op=>btn(t('svg.bool.'+op),<BoolGlyph op={op}/>,()=>void run(()=>booleanOp(sel,op)),!canBool||busy))}
  <Sep/>
  {btn(t('svg.clip.make'),<ClipGlyph kind="clip"/>,()=>makeClip(sel,'clip'),!canClip(sel))}{btn(t('svg.mask.make'),<ClipGlyph kind="mask"/>,()=>makeClip(sel,'mask'),!canClip(sel))}{btn(t('svg.clip.release'),<ClipGlyph kind="release"/>,()=>one&&releaseClip(sel[0]),!one||!clipInfo(one))}
  <Sep/>
  {btn(t('svg.snap.on'),<ClipGlyph kind="snap"/>,()=>patchUi({snap:!ui.snap}),false,ui.snap)}
  <Sep/>
  {btn(t('svg.placeImage'),<ImageIcon size={15}/>,()=>file.current?.click())}<input ref={file} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" data-testid="svg-place-input" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void run(()=>placeImage(f));}}/>
  {one&&isTraceable(one)&&<>
   <label className="flex items-center gap-1 text-[11px]">{t('svg.trace.colors')}<input data-testid="svg-trace-colors" type="number" min={2} max={32} value={tr.colors} className="!h-6 !w-12 text-[11px]" aria-label={t('svg.trace.colors')} onKeyDown={e=>e.stopPropagation()} onChange={e=>setTr({...tr,colors:Math.min(32,Math.max(2,+e.target.value||2))})}/></label>
   <Button size="compact" data-testid="svg-trace" disabled={busy} onClick={()=>void run(()=>traceImage(sel[0],tr))}>{t('svg.trace.run')}</Button></>}
  {ui.tool==='node'&&<><Sep/>
   <Button size="compact" disabled={!ui.node} onClick={()=>nodeEdit((cs,c,i)=>setKind(cs[c],i,'corner'))}>{t('svg.nodeCorner')}</Button>
   <Button size="compact" disabled={!ui.node} onClick={()=>nodeEdit((cs,c,i)=>setKind(cs[c],i,'smooth'))}>{t('svg.nodeSmooth')}</Button>
   {btn(t('svg.nodeDelete'),<Minus size={15}/>,()=>{nodeEdit((cs,c,i)=>{if(cs[c].nodes.length>2){cs[c].nodes.splice(i,1);patchUi({node:null});}});},!ui.node)} </>}
 </div>;}
