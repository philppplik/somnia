import '../../lib/sheets/panelI18n';
import {useState} from 'react';
import {useT} from '../../lib/useT';
import type {PanelHostProps,InspectorSectionProps} from '../../lib/shell/types';
import {rangeAddress} from '../../lib/sheets/panelModel';
import {colName} from '../../lib/sheets/format';
import {sortBlockProblem} from '../../lib/sheets/sortOps';
import {MAX_FILTER_SCAN_ROWS,distinctValues,type DistinctValues} from '../../lib/sheets/filterOps';
import type {FilterOp,RangeCell} from '../../lib/sheets/protocol';
import {getSlicerFilter,pickedFromMirror,slicerFilterAllowed,useSlicerFilter} from '../../lib/sheets/slicerState';
import {Checkbox} from '../ui/checkbox';
import {Button} from '../ui/button';
import {NativeSelect} from '../ui/native-controls';
import {Region,useAction,usePanelWorkbook} from './SheetsPanels';

const MAX_SLICER_COLUMNS=100;
const field='w-full min-w-0 rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink';
const OP_SYMBOLS:Record<string,string>={'=':'=','<>':'\u2260','>':'>','<':'<','>=':'\u2265','<=':'\u2264'};

/** Short honest label for a mirrored filter op (readback line only). */
function describeFilter(t:(k:string,p?:Record<string,string|number>)=>string,op:FilterOp):string{
 switch(op.kind){
  case 'values':return t('sheets.slicer.op.values',{n:op.values.length})+(op.blanks?' + '+t('sheets.vf.blanks'):'');
  case 'custom':return (OP_SYMBOLS[op.op]??t('sheets.filter.op.'+op.op))+' '+op.value;
  case 'top':return t('sheets.vf.q.'+(op.bottom?(op.percent?'bottomPercent':'bottom'):(op.percent?'topPercent':'top')))+' '+op.count;
  case 'color':return t(op.by==='fill'?'sheets.vf.q.fillColor':'sheets.vf.q.fontColor');
  case 'aboveAverage':return t(op.above?'sheets.vf.q.above':'sheets.vf.q.below');
  default:return op.kind;
 }
}

/**
 * Filter slicer: an inspector section bound to one column of the current selection.
 * The value list (with counts, blanks entry and multi-select) loads only on a user
 * action (picking a column or pressing refresh); applying runs the existing engine
 * op filter kind:'values' as one undo step, clear runs kind:'clear'. The readback
 * line mirrors what this session applied and marks itself stale after undo/redo
 * instead of showing a possibly wrong state; the slicer itself is a view and is
 * not persisted to the file.
 */
export function SheetsSlicerPanel({context}:PanelHostProps){
 const {t}=useT(),s=usePanelWorkbook(context),action=useAction();
 const [column,setColumn]=useState(0);
 const [loaded,setLoaded]=useState<{key:string;data:DistinctValues}|null>(null);
 const [off,setOff]=useState<ReadonlySet<string>>(new Set());
 const [blanksOn,setBlanksOn]=useState(true);
 const mirror=useSlicerFilter(s?.file,s?.sheet);
 if(!s)return <Region><p>{t('sheets.panel.none')}</p></Region>;
 const allowed=slicerFilterAllowed(s.layout?.protection);
 const r=s.range;
 if(!r)return null;
 const rows=r.r1-r.r0+1,cols=r.c1-r.c0+1,col=Math.min(column,cols-1),block=sortBlockProblem(rows,cols,true),key=s.file+' '+s.sheet+':'+rangeAddress(r)+':'+col,data=loaded?.key===key?loaded.data:null;
 const abs=r.c0+col,options=Array.from({length:Math.min(cols,MAX_SLICER_COLUMNS)},(_,i)=>i);
 const load=async(c:number)=>{
  if(block||rows-1>MAX_FILTER_SCAN_ROWS){action.setNotice(t('sheets.vf.big',{n:MAX_FILTER_SCAN_ROWS}));return;}
  const cells=await action.run('sheets.analyzeRange',{range:rangeAddress({r0:r.r0+1,r1:r.r1,c0:r.c0+c,c1:r.c0+c})});
  if(!cells)return;
  const d=distinctValues(cells as RangeCell[],rows-1);
  setLoaded({key:s.file+' '+s.sheet+':'+rangeAddress(r)+':'+c,data:d});
  const m=getSlicerFilter(s.file,s.sheet),init=m?pickedFromMirror(d,m,r.c0+c):null;
  if(init){setOff(init.off);setBlanksOn(init.blanksOn);}else{setOff(new Set());setBlanksOn(true);}
 };
 const picked=data?data.values.filter(v=>!off.has(v.text)).map(v=>v.text):[];
 const apply=()=>{if(data)void action.run('sheets.filter',{kind:'values',column:abs,values:picked,blanks:blanksOn&&data.blanks>0});};
 const clear=()=>void action.run('sheets.filter',{kind:'clear',column:abs});
 const status=mirror===null?t('sheets.slicer.unknown')
  :mirror.stale?t('sheets.slicer.stale',{column:mirror.op&&'column' in mirror.op?colName(mirror.op.column):'–',what:mirror.op?describeFilter(t,mirror.op):t('sheets.slicer.op.none')})
  :mirror.op?t('sheets.slicer.active',{column:'column' in mirror.op?colName(mirror.op.column):'–',what:describeFilter(t,mirror.op)})
  :t('sheets.slicer.none');
 return <Region>
  <p className="text-ink-3" data-testid="sheets-slicer-status">{status}</p>
  <label className="flex flex-col gap-1">{t('sheets.filter.column')}<NativeSelect className={field} value={col} disabled={action.busy} onChange={e=>{const c=Number(e.currentTarget.value);setColumn(c);void load(c);}} data-testid="sheets-slicer-column">{options.map(i=><option key={i} value={i}>{colName(r.c0+i)}</option>)}</NativeSelect></label>
  <Button variant="outline" size="compact" disabled={action.busy||!!block} onClick={()=>void load(col)} data-testid="sheets-slicer-load">{t(data?'sheets.slicer.refresh':'sheets.slicer.load')}</Button>
  {!allowed&&<p className="text-ink-3" data-testid="sheets-slicer-protected">{t('sheets.slicer.protected')}</p>}
  {data&&<div className="flex flex-col gap-1" data-testid="sheets-slicer-list">
   {data.values.map(v=><Checkbox key={v.text} label={v.text+' ('+v.count+')'} checked={!off.has(v.text)} disabled={action.busy} onChange={e=>{const on=e.currentTarget.checked;setOff(p=>{const n=new Set(p);if(on)n.delete(v.text);else n.add(v.text);return n;});}}/>)}
   {data.blanks>0&&<Checkbox label={t('sheets.vf.blanks')+' ('+data.blanks+')'} checked={blanksOn} disabled={action.busy} onChange={e=>setBlanksOn(e.currentTarget.checked)}/>}
   {data.truncated&&<><p className="text-ink-3">{t('sheets.vf.truncated',{n:data.values.length})}</p><p className="text-ink-3" data-testid="sheets-slicer-truncated-warn">{t('sheets.slicer.truncatedWarn')}</p></>}
   <Button variant="outline" size="compact" disabled={action.busy||!allowed||(picked.length===0&&!(blanksOn&&data.blanks>0))} onClick={apply} data-testid="sheets-slicer-apply">{t('sheets.vf.apply')}</Button>
  </div>}
  <Button variant="outline" size="compact" disabled={action.busy||!allowed||(mirror!==null&&!mirror.stale&&mirror.op===null)} onClick={clear} data-testid="sheets-slicer-clear">{t('sheets.slicer.clear')}</Button>
  <p className="text-ink-3">{t(block?'sheets.sort.need':'sheets.vf.scope',{range:rangeAddress(r)})}</p>
  {action.notice?<p role="alert">{action.notice}</p>:null}
 </Region>;
}
export function SheetsSlicerSection({sectionId,context}:InspectorSectionProps){return <SheetsSlicerPanel panelId={sectionId} context={context}/>;}
