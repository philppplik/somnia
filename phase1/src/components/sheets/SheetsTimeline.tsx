import '../../lib/sheets/panelI18n';
import {useState} from 'react';
import {useT} from '../../lib/useT';
import type {PanelHostProps,InspectorSectionProps} from '../../lib/shell/types';
import {rangeAddress} from '../../lib/sheets/panelModel';
import {colName} from '../../lib/sheets/format';
import {sortBlockProblem} from '../../lib/sheets/sortOps';
import {MAX_FILTER_SCAN_ROWS} from '../../lib/sheets/filterOps';
import type {ViewCell} from '../../lib/sheets/protocol';
import {sameRange,tableFilterRange,tablesHere} from '../../lib/sheets/tableBinding';
import {getSlicerFilter,slicerFilterAllowed,useSlicerFilter} from '../../lib/sheets/slicerState';
import {bucketDates,currentPeriod,isDateFmt,periodFilterOp,periodTicksFromMirror,pickedPeriodValues,periodsFitValues,type TimelineBucket,type TimelineGranularity} from '../../lib/sheets/timelineOps';
import {localSerial} from '../../lib/sheets/clock';
import {Checkbox} from '../ui/checkbox';
import {Button} from '../ui/button';
import {NativeSelect} from '../ui/native-controls';
import {Region,useAction,usePanelWorkbook} from './SheetsPanels';
import {describeFilter} from './SheetsSlicer';

const MAX_TIMELINE_COLUMNS=100;
const GRANULARITIES:readonly TimelineGranularity[]=['year','quarter','month','day'];
const field='w-full min-w-0 rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink';

/**
 * Filter timeline: an inspector section bound to one date column of the current
 * selection. Loading reads the column once (bounded styled read); picking a
 * granularity only re-buckets locally. Applying ticks periods as one undo step
 * through the filter kind:'range' op for one picked period without blanks and the
 * kind:'values' op otherwise (Path B where it fits, Path A as the fallback of the
 * timeline concept:
 * display-text identity, 200-pick bound gated honestly), clear runs kind:'clear'.
 * The readback line reuses the slicer's session mirror; protection follows the
 * 'autofilter' permission. The timeline is a view on the AutoFilter and is not
 * persisted to the file.
 */
export function SheetsTimelinePanel({context}:PanelHostProps){
 const {t,locale}=useT(),s=usePanelWorkbook(context),action=useAction();
 const [column,setColumn]=useState(0);
 const [granularity,setGranularity]=useState<TimelineGranularity>('month');
 const [scan,setScan]=useState<{key:string;serials:number[];blanks:number;dates:number}|null>(null);
 const [off,setOff]=useState<ReadonlySet<number>>(new Set());
 const [blanksOn,setBlanksOn]=useState(true);
 const absCol=s&&s.range?s.range.c0+Math.min(column,s.range.c1-s.range.c0):undefined;
 const mirror=useSlicerFilter(s?.file,s?.sheet,absCol);
 if(!s)return <Region><p>{t('sheets.panel.none')}</p></Region>;
 const allowed=slicerFilterAllowed(s.layout?.protection);
 const r=s.range;
 if(!r)return null;
 const rows=r.r1-r.r0+1,cols=r.c1-r.c0+1,col=Math.min(column,cols-1),block=sortBlockProblem(rows,cols,true),key=s.file+' '+s.sheet+':'+rangeAddress(r)+':'+col;
 const abs=r.c0+col,options=Array.from({length:Math.min(cols,MAX_TIMELINE_COLUMNS)},(_,i)=>i);
 const live=scan?.key===key?scan:null;
 const result=live&&live.dates>0?bucketDates(live.serials,granularity,live.blanks,locale):null;
 const hits=tablesHere(s.tables?.tables,r),bound=hits.find(h=>sameRange(tableFilterRange(h),r));
 const pickCurrent=()=>{
  if(!result)return;
  const now=localSerial(new Date()),b=now!==null?currentPeriod(result.buckets,now):null;
  if(!b){action.setNotice(t('sheets.timeline.nocurrent'));return;}
  setOff(new Set(result.buckets.filter(x=>x!==b).map(x=>x.key)));
 };
 const load=async(c:number)=>{
  if(block||rows-1>MAX_FILTER_SCAN_ROWS){action.setNotice(t('sheets.vf.big',{n:MAX_FILTER_SCAN_ROWS}));return;}
  const cells=await action.run('sheets.analyzeRange',{range:rangeAddress({r0:r.r0+1,r1:r.r1,c0:r.c0+c,c1:r.c0+c}),styled:true});
  if(!cells)return;
  let blanks=0;const serials:number[]=[];
  for(const cell of cells as ViewCell[]){
   const v=cell.value;
   if(v.t==='Empty'||(v.t==='Text'&&v.v==='')){blanks++;continue;}
   if(v.t==='Number'&&Number.isFinite(v.v)&&isDateFmt(cell.style?.fmt??''))serials.push(v.v);
  }
  setScan({key,serials,blanks,dates:serials.length});
  seed(bucketDates(serials,granularity,blanks,locale).buckets);
 };
 // Ticks follow the mirror when it knows a fresh filter on the bound column (the
 // slicer does the same for its value list); otherwise the list starts all-ticked.
 function seed(buckets:TimelineBucket[]){
  const m=getSlicerFilter(s!.file,s!.sheet,abs),init=m?periodTicksFromMirror(buckets,m):null;
  if(init){setOff(init.off);setBlanksOn(init.blanksOn);}else{setOff(new Set());setBlanksOn(true);}
 }
 const picked=result?result.buckets.filter(b=>!off.has(b.key)):[];
 const values=pickedPeriodValues(picked),fits=periodsFitValues(picked);
 // One picked period without blanks filters by its exact half-open serial range - no
 // value list, so it also works when the period holds more than MAX_FILTER_PICKS days.
 const single=picked.length===1&&!(blanksOn&&result&&result.blanks>0);
 const op=result?periodFilterOp(abs,picked,blanksOn&&result.blanks>0):null;
 const apply=()=>{if(op)void action.run('sheets.filter',op);};
 const clear=()=>void action.run('sheets.filter',{kind:'clear',column:abs});
 const status=mirror===null?t('sheets.slicer.unknown')
  :mirror.stale?t('sheets.slicer.stale',{column:mirror.op&&'column' in mirror.op?colName(mirror.op.column):'–',what:mirror.op?describeFilter(t,mirror.op):t('sheets.slicer.op.none')})
  :mirror.op?t('sheets.slicer.active',{column:'column' in mirror.op?colName(mirror.op.column):'–',what:describeFilter(t,mirror.op)})
  :t('sheets.slicer.none');
 return <Region>
  <p className="text-ink-3" data-testid="sheets-timeline-status">{status}</p>
  <label className="flex flex-col gap-1">{t('sheets.timeline.column')}<NativeSelect className={field} value={col} disabled={action.busy} onChange={e=>{const c=Number(e.currentTarget.value);setColumn(c);void load(c);}} data-testid="sheets-timeline-column">{options.map(i=><option key={i} value={i}>{colName(r.c0+i)}</option>)}</NativeSelect></label>
  <Button variant="outline" size="compact" disabled={action.busy||!!block} onClick={()=>void load(col)} data-testid="sheets-timeline-load">{t(scan?'sheets.slicer.refresh':'sheets.slicer.load')}</Button>
  {bound?<p className="text-ink-3" data-testid="sheets-timeline-bound">{t('sheets.timeline.bound',{name:bound.table.name})}</p>
   :hits.length>0&&<div className="flex flex-wrap gap-1" role="group" aria-label={t('sheets.timeline.tables')} data-testid="sheets-timeline-tables">{hits.map(h=><Button key={h.table.name} variant="outline" size="compact" disabled={action.busy} onClick={()=>void action.run('sheets.navigate',{sheet:s.sheet,address:rangeAddress(tableFilterRange(h))})} data-testid={'sheets-timeline-bind-'+h.table.name}>{t('sheets.timeline.bind',{name:h.table.name})}</Button>)}</div>}
  {live&&live.dates===0&&<p className="text-ink-3" data-testid="sheets-timeline-nodates">{t('sheets.timeline.nodates')}</p>}
  {result&&<label className="flex flex-col gap-1">{t('sheets.timeline.granularity')}<NativeSelect className={field} value={granularity} disabled={action.busy} onChange={e=>{const g=e.currentTarget.value as TimelineGranularity;setGranularity(g);if(live)seed(bucketDates(live.serials,g,live.blanks,locale).buckets);else setOff(new Set());}} data-testid="sheets-timeline-granularity">{GRANULARITIES.map(g=><option key={g} value={g}>{t('sheets.timeline.g.'+g)}</option>)}</NativeSelect></label>}
  {!allowed&&<p className="text-ink-3" data-testid="sheets-timeline-protected">{t('sheets.slicer.protected')}</p>}
  {result&&<div className="flex flex-col gap-1" data-testid="sheets-timeline-list">
   {result.buckets.map(b=><Checkbox key={b.key} label={b.label+' ('+b.count+')'} checked={!off.has(b.key)} disabled={action.busy} onChange={e=>{const on=e.currentTarget.checked;setOff(p=>{const n=new Set(p);if(on)n.delete(b.key);else n.add(b.key);return n;});}}/>)}
   {result.blanks>0&&<Checkbox label={t('sheets.vf.blanks')+' ('+result.blanks+')'} checked={blanksOn} disabled={action.busy} onChange={e=>setBlanksOn(e.currentTarget.checked)}/>}
   {result.truncated&&<p className="text-ink-3">{t('sheets.timeline.truncated',{n:result.buckets.length})}</p>}
   <Button variant="outline" size="compact" disabled={action.busy} onClick={pickCurrent} data-testid="sheets-timeline-current">{t('sheets.timeline.current.'+granularity)}</Button>
   {!single&&!fits&&<p className="text-ink-3" data-testid="sheets-timeline-toomany">{t('sheets.timeline.toomany')}</p>}
   <Button variant="outline" size="compact" disabled={action.busy||!allowed||!op} onClick={apply} data-testid="sheets-timeline-apply">{t('sheets.vf.apply')}</Button>
  </div>}
  <Button variant="outline" size="compact" disabled={action.busy||!allowed||(mirror!==null&&!mirror.stale&&mirror.op===null)} onClick={clear} data-testid="sheets-timeline-clear">{t('sheets.slicer.clear')}</Button>
  <p className="text-ink-3">{t(block?'sheets.sort.need':'sheets.timeline.scope',{range:rangeAddress(r)})}</p>
  {action.notice?<p role="alert">{action.notice}</p>:null}
 </Region>;
}
export function SheetsTimelineSection({sectionId,context}:InspectorSectionProps){return <SheetsTimelinePanel panelId={sectionId} context={context}/>;}
