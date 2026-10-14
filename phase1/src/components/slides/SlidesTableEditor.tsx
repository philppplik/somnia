import {useEffect,useMemo,useRef,useState} from 'react';
import {Button} from '../ui/button';
import {Textarea} from '../ui/native-controls';
import {Menu,MenuTrigger,MenuContent,MenuItem} from '../ui/menu';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {useSlidesSession} from '../../lib/slides/session';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import {readTable,MAX_CELL_TEXT,MAX_TABLE_ROWS,MAX_TABLE_COLS} from '../../lib/slides/deckPackage';
import {TEXT_COLORS} from '../../lib/slides/textFormat';
import {useValidShape} from './SlidesShapeOverlay';

const SCOPES=['cell','row','column','table'] as const;
/** Cell text, rows, columns, header flag and fills of the selected table. Every action is one command, so one undo step. */
export function SlidesTableEditor(){
  const s=useSlidesSession(),t=useSlidesPanelText(),valid=useValidShape(),slideId=s.slideIds[s.index];
  const shape=valid&&valid.more.length===0&&valid.shape.kind==='table'?valid.shape:null;
  const info=useMemo(()=>{if(!shape||!s.working||slideId===undefined)return null;return readTable(s.working,slideId,shape.id);},[s.working,slideId,shape]);
  const working=useRef(false),[jobs,setJobs]=useState<Record<string,unknown>[]>([]),[tick,setTick]=useState(0),[draft,setDraft]=useState<string[][]>([]),[at,setAt]=useState({row:0,col:0}),[scope,setScope]=useState<typeof SCOPES[number]>('cell'),[error,setError]=useState('');
  useEffect(()=>{setDraft(info?.cells.map(r=>[...r])??[]);},[info]);
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
  /** Edits wait in a queue until the session is idle, so a press right after typing is run after the cell commit instead of being refused or dropped. */
  const run=(edit:Record<string,unknown>)=>setJobs(j=>[...j.slice(-9),edit]);
  const commit=(r:number,c:number)=>{const v=draft[r]?.[c];if(v!==undefined&&v!==inf.cells[r][c])void run({kind:'cell',row:r,col:c,text:v});};
  /** Pressing a toolbar control keeps focus in the cell and commits it first, so the press is never lost to a re-render. */
  const press={onMouseDown:(e:React.MouseEvent)=>{e.preventDefault();commit(row,col);}};
  /** Pointer presses act on mousedown (after committing the cell) because the re-render of a commit can swallow the click; keyboard activation (detail 0) uses click. */
  const act=(edit:Record<string,unknown>)=>({onMouseDown:(e:React.MouseEvent)=>{e.preventDefault();commit(row,col);void run(edit);},onClick:(e:React.MouseEvent)=>{if(e.detail===0)void run(edit);}});
  return <div className="flex flex-col gap-2 px-4 py-2" data-slot="slides-table-editor">
    <div className="flex flex-wrap items-center gap-2">
      <Button size="compact" variant="outline" disabled={!ready||inf.rows>=MAX_TABLE_ROWS} {...act({kind:'insertRow',at:row+1})}>{t('slides.table.insertRow')}</Button>
      <Button size="compact" variant="outline" disabled={!ready||inf.rows<=1} {...act({kind:'removeRow',at:row})}>{t('slides.table.removeRow')}</Button>
      <Button size="compact" variant="outline" disabled={!ready||inf.cols>=MAX_TABLE_COLS} {...act({kind:'insertCol',at:col+1})}>{t('slides.table.insertCol')}</Button>
      <Button size="compact" variant="outline" disabled={!ready||inf.cols<=1} {...act({kind:'removeCol',at:col})}>{t('slides.table.removeCol')}</Button>
      <Button size="compact" variant={inf.header?'primary':'outline'} aria-pressed={inf.header} disabled={!ready} {...act({kind:'header',on:!inf.header})}>{t('slides.table.header')}</Button>
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
          <Textarea key={ci} rows={1} aria-label={t('slides.table.cell',{row:ri+1,col:ci+1})} aria-current={ri===row&&ci===col?'true':undefined} className={`min-h-8 w-32 shrink-0 resize-y rounded border bg-transparent p-1 text-sm ${ri===row&&ci===col?'border-accent':'border-subtle'}`} value={v} maxLength={MAX_CELL_TEXT} disabled={!ready}
            onFocus={()=>setAt({row:ri,col:ci})} onChange={e=>setDraft(d=>d.map((x,i)=>i===ri?x.map((y,j)=>j===ci?e.target.value:y):x))} onBlur={()=>commit(ri,ci)}/>)}</div>)}
      </div>
    </div>
  </div>;
}
