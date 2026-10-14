import {useEffect,useMemo,useRef,useState} from 'react';
import {Button} from '../ui/button';
import {Textarea} from '../ui/native-controls';
import {Menu,MenuTrigger,MenuContent,MenuItem} from '../ui/menu';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {useSlidesSession} from '../../lib/slides/session';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import {NumberField} from '../ui/number-field';
import {readTable,MAX_CELL_TEXT,MAX_TABLE_ROWS,MAX_TABLE_COLS,MIN_ROW_PT,MAX_ROW_PT,MIN_COL_PT,MAX_COL_PT} from '../../lib/slides/deckPackage';
import {TEXT_COLORS} from '../../lib/slides/textFormat';
import {useValidShape} from './SlidesShapeOverlay';
import {SlidesTableHandoff} from './SlidesTableHandoff';

const SCOPES=['cell','row','column','table'] as const;
/** Cell text, rows, columns, header flag and fills of the selected table. Every action is one command, so one undo step. */
export function SlidesTableEditor(){
  const s=useSlidesSession(),t=useSlidesPanelText(),valid=useValidShape(),slideId=s.slideIds[s.index];
  const shape=valid&&valid.more.length===0&&valid.shape.kind==='table'?valid.shape:null;
  const info=useMemo(()=>{if(!shape||!s.working||slideId===undefined)return null;return readTable(s.working,slideId,shape.id);},[s.working,slideId,shape]);
  const working=useRef(false),[jobs,setJobs]=useState<Record<string,unknown>[]>([]),[tick,setTick]=useState(0),[draft,setDraft]=useState<string[][]>([]),[at,setAt]=useState({row:0,col:0}),[scope,setScope]=useState<typeof SCOPES[number]>('cell'),[error,setError]=useState('');
  const prevCells=useRef<string[][]>([]);
  /** Take the saved text, but keep what the user typed in cells that were still unsaved (a save of another cell must not erase it). */
  useEffect(()=>{
    const next=info?.cells??[],prev=prevCells.current;prevCells.current=next;
    setDraft(d=>next.map((r,i)=>r.map((v,j)=>prev.length===next.length&&prev[i]?.length===r.length&&d[i]?.[j]!==undefined&&d[i][j]!==prev[i][j]?d[i][j]:v)));
  },[info]);
  const prevShape=useRef<string|null>(null);
  useEffect(()=>{if(!shape)return;const k=`${slideId}:${shape.id}`;if(prevShape.current!==null&&prevShape.current!==k){setError('');setJobs([]);}prevShape.current=k;},[shape,slideId]);
  useEffect(()=>{
    if(!shape||!jobs.length||s.busy||working.current)return;
    working.current=true;const [job,...rest]=jobs;setJobs(rest);
    void commandDispatcher.tryRunCommand('slides.editTable',{source:s.source,slideId,shapeId:shape.id,edit:job},{origin:'ui'}).then(r=>setError(r.ok?'':r.error.message)).finally(()=>{working.current=false;setTick(x=>x+1);});
  },[jobs,s.busy,tick,shape,slideId,s.source]);
  const last=useRef<{shape:NonNullable<typeof shape>;info:NonNullable<typeof info>}|null>(null);
  if(shape&&info)last.current={shape,info};
  /** While an edit is applying the selection is briefly unavailable; keep the last view so controls are not replaced mid-press. */
  const view=shape&&info?{shape,info}:s.busy?last.current:null;
  if(!view)return null;
  const {info:inf}=view;
  if(!inf.editable)return <p className="px-4 py-2 text-xs text-ink-3">{t('slides.table.readonly')}</p>;
  const ready=!s.presenting,row=Math.min(at.row,inf.rows-1),col=Math.min(at.col,inf.cols-1);
  return <div className="flex flex-col gap-2 px-4 py-2" data-slot="slides-table-editor">
    <SlidesTableHandoff source={s.source} slideIndex={s.index} slideId={slideId} shapeId={shape.id} cells={inf.cells} ready={ready} isBusy={()=>working.current||s.busy} commit={()=>commit(row,col)}
      editCell={(r,c,text)=>commandDispatcher.tryRunCommand('slides.editTable',{source:s.source,slideId,shapeId:shape.id,edit:{kind:'cell',row:r,col:c,text}},{origin:'ui'}).then(x=>x.ok?{ok:true}:{ok:false,message:x.error.message})} onError={setError}/>
    <div className="flex flex-wrap items-center gap-2">
      <Button size="compact" variant="outline" disabled={!ready||inf.rows>=MAX_TABLE_ROWS||inf.merged.length>0} {...act({kind:'insertRow',at:row+1})}>{t('slides.table.insertRow')}</Button>
      <Button size="compact" variant="outline" disabled={!ready||inf.rows<=1||inf.merged.length>0} {...act({kind:'removeRow',at:row})}>{t('slides.table.removeRow')}</Button>
      <Button size="compact" variant="outline" disabled={!ready||inf.cols>=MAX_TABLE_COLS||inf.merged.length>0} {...act({kind:'insertCol',at:col+1})}>{t('slides.table.insertCol')}</Button>
      <Button size="compact" variant="outline" disabled={!ready||inf.cols<=1||inf.merged.length>0} {...act({kind:'removeCol',at:col})}>{t('slides.table.removeCol')}</Button>
      <Button size="compact" variant={inf.header?'primary':'outline'} aria-pressed={inf.header} disabled={!ready} {...act({kind:'header',on:!inf.header})}>{t('slides.table.header')}</Button>
      <Menu><MenuTrigger render={<Button {...press} size="compact" variant="outline" disabled={!ready}>{t('slides.table.merge')}</Button>}/>
        <MenuContent>
          <MenuItem disabled={col+1>=inf.cols} onClick={()=>void run({kind:'merge',row,col,rowSpan:1,colSpan:2})}>{t('slides.table.merge.right')}</MenuItem>
          <MenuItem disabled={row+1>=inf.rows} onClick={()=>void run({kind:'merge',row,col,rowSpan:2,colSpan:1})}>{t('slides.table.merge.below')}</MenuItem>
          <MenuItem disabled={inf.cols<2} onClick={()=>void run({kind:'merge',row,col:0,rowSpan:1,colSpan:inf.cols})}>{t('slides.table.merge.row')}</MenuItem>
          <MenuItem disabled={inf.rows<2} onClick={()=>void run({kind:'merge',row:0,col,rowSpan:inf.rows,colSpan:1})}>{t('slides.table.merge.column')}</MenuItem>
        </MenuContent></Menu>
      <Button size="compact" variant="outline" disabled={!ready||!inf.merged.some(m=>m.row===row&&m.col===col)} {...act({kind:'split',row,col})}>{t('slides.table.split')}</Button>
      <div className="w-28"><NumberField label={t('slides.table.rowHeight')} value={Math.round(inf.rowH[row]/1270)/10} resetKey={`rh:${row}:${inf.rowH[row]}`} min={MIN_ROW_PT} max={MAX_ROW_PT} step={1} disabled={!ready}
        parse={d=>/^\d{1,3}(\.\d)?$/.test(d.trim())&&Number(d)>=MIN_ROW_PT&&Number(d)<=MAX_ROW_PT?{ok:true,value:Number(d)}:{ok:false,error:t('slides.table.heightInvalid')}} constraintError={t('slides.table.heightInvalid')} onCommit={v=>void run({kind:'rowHeight',at:row,heightPt:v})}/></div>
      <div className="w-28"><NumberField label={t('slides.table.colWidth')} value={Math.round(inf.colW[col]/1270)/10} resetKey={`cw:${col}:${inf.colW[col]}`} min={MIN_COL_PT} max={MAX_COL_PT} step={1} disabled={!ready}
        parse={d=>/^\d{1,4}(\.\d)?$/.test(d.trim())&&Number(d)>=MIN_COL_PT&&Number(d)<=MAX_COL_PT?{ok:true,value:Number(d)}:{ok:false,error:t('slides.table.widthInvalid')}} constraintError={t('slides.table.widthInvalid')} onCommit={v=>void run({kind:'colWidth',at:col,widthPt:v})}/></div>
      <Menu><MenuTrigger render={<Button {...press} size="compact" variant="outline" disabled={!ready}>{t('slides.table.scope')}: {t(`slides.table.scope.${scope}`)}</Button>}/>
        <MenuContent>{SCOPES.map(x=><MenuItem key={x} onClick={()=>setScope(x)}>{scope===x?'• ':''}{t(`slides.table.scope.${x}`)}</MenuItem>)}</MenuContent></Menu>
      <Menu><MenuTrigger render={<Button {...press} size="compact" variant="outline" disabled={!ready}>{t('slides.table.fill')}</Button>}/>
        <MenuContent>
          <MenuItem onClick={()=>void run({kind:'fill',scope,row,col,none:true})}>{t('slides.table.fillNone')}</MenuItem>
          {TEXT_COLORS.map(c=><MenuItem key={c.key} onClick={()=>void run({kind:'fill',scope,row,col,color:c.hex})}>{t(`slides.color.${c.key}`)}</MenuItem>)}
        </MenuContent></Menu>
      {error&&<span role="alert" className="text-xs text-danger">{error}</span>}
    </div>
    <div className="max-h-64 overflow-auto" role="group" aria-label={t('slides.table.label')}>
      <div className="grid gap-1">
        {draft.map((r,ri)=><div key={ri} className="flex gap-1">{r.map((v,ci)=>
          <Textarea key={ci} rows={1} aria-label={t('slides.table.cell',{row:ri+1,col:ci+1})} aria-current={ri===row&&ci===col?'true':undefined} className={`min-h-8 w-32 shrink-0 resize-y rounded border bg-transparent p-1 text-sm ${ri===row&&ci===col?'border-accent':'border-subtle'}`} value={v} maxLength={MAX_CELL_TEXT} disabled={!ready||inf.covered[ri]?.[ci]}
            onFocus={()=>setAt({row:ri,col:ci})} onChange={e=>setDraft(d=>d.map((x,i)=>i===ri?x.map((y,j)=>j===ci?e.target.value:y):x))} onBlur={()=>commit(ri,ci)}/>)}</div>)}
      </div>
    </div>
  </div>;
}
