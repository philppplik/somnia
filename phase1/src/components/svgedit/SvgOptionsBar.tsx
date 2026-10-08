import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {useSvgUi,patchUi} from '../../lib/svgedit/store';
import * as C from '../../lib/svgedit/controller';
import {elementAt,parsePathKey} from '../../lib/svgedit/source';
import {pathToContours,contoursToPath,setKind} from '../../lib/svgedit/pathnodes';
import {attr} from '../../lib/svgedit/source';
import type {AlignKind} from '../../lib/svgedit/geometry';
import {AlignStartVertical,AlignCenterVertical,AlignEndVertical,AlignStartHorizontal,AlignCenterHorizontal,AlignEndHorizontal,ArrowUpToLine,ArrowDownToLine,ArrowUp,ArrowDown,ArrowLeftRight,ArrowUpDown,RotateCw,RotateCcw,Container,SquareDashed,PencilLine,Minus} from '../../lib/icons';
const Sep=()=><span className="mx-1 h-4 w-px bg-[var(--border-subtle)]" aria-hidden="true"/>;
export function SvgOptionsBar(){
 const {t}=useT();const ui=useSvgUi();const sel=ui.selection;const has=sel.length>0;const {root}=C.scan();
 const one=sel.length===1&&root?elementAt(root,parsePathKey(sel[0])):null;
 const btn=(label:string,icon:React.ReactNode,on:()=>void,disabled=false,pressed?:boolean)=><Button size="icon" className="!size-7" aria-label={label} title={label} disabled={disabled} aria-pressed={pressed} onClick={on}>{icon}</Button>;
 const al=(k:AlignKind,label:string,icon:React.ReactNode)=>btn(label,icon,()=>C.align(sel,k),!has);
 const nodeEdit=(fn:(cs:ReturnType<typeof pathToContours>&object,c:number,i:number)=>void)=>{if(!one||one.tag!=='path'||!ui.node)return;const cs=pathToContours(attr(one,'d')??'');if(!cs)return;fn(cs,ui.node.c,ui.node.i);C.setPathData(sel[0],contoursToPath(cs));};
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
  {ui.tool==='node'&&<><Sep/>
   <Button size="compact" disabled={!ui.node} onClick={()=>nodeEdit((cs,c,i)=>setKind(cs[c],i,'corner'))}>{t('svg.nodeCorner')}</Button>
   <Button size="compact" disabled={!ui.node} onClick={()=>nodeEdit((cs,c,i)=>setKind(cs[c],i,'smooth'))}>{t('svg.nodeSmooth')}</Button>
   {btn(t('svg.nodeDelete'),<Minus size={15}/>,()=>{nodeEdit((cs,c,i)=>{if(cs[c].nodes.length>2){cs[c].nodes.splice(i,1);patchUi({node:null});}});},!ui.node)} </>}
 </div>;}
