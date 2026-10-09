import {StudioEmptyState} from '../studios/StudioEmptyState';
import {createBlankProject} from '../../lib/studios/blank';
import {useCallback,useEffect,useMemo,useRef,useState,type KeyboardEvent} from 'react';
import {FileTabs} from '../FileTabs';
import {Button} from '../ui/button';
import {Table2,Redo2,Undo2} from '../../lib/icons';
import {addMediaFile,formatBytes,useMedia,type MediaItem} from '../../lib/media';
import {useT} from '../../lib/useT';
import {SheetsEngine} from '../../lib/sheets/engine';
import type {SheetInfo,SheetLayout,ViewCell,WorkbookInfo} from '../../lib/sheets/protocol';
import {Geometry} from '../../lib/sheets/geometry';
import {MAX_CELL_BYTES} from '../../lib/sheets/protocol';
import {addressOf,cellText,colName,displayValue,editText,isErrorValue,cellAlign} from '../../lib/sheets/format';
import {setSheetsSelection} from '../../lib/sheets/sheetsStore';
const HEAD_W=48,HEAD_H=24;
const stem=(n:string)=>n.replace(/^.*[\\/]/,'').replace(/\.[^.]+$/,'');
function download(name:string,data:Uint8Array){const url=URL.createObjectURL(new Blob([data as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
type Phase={kind:'loading'}|{kind:'error';message:string}|{kind:'ready'};
export function SheetsCanvas(){
 const media=useMedia();const {t}=useT();const item=media.items.find(i=>i.name===media.active&&i.kind==='xlsx');
 if(!item)return <main className="center" aria-label={t('sheets.workspace')}><div className="workspace"><section className="code-pane" aria-label={t('sheets.workspace')}><FileTabs/><StudioEmptyState studio="sheets" icon={<Table2/>} onOpen={()=>new Promise<void>((resolve,reject)=>{const input=document.createElement('input');input.type='file';input.accept='.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';input.oncancel=()=>resolve();input.onchange=async()=>{try{const file=input.files?.[0];if(file){const result=await addMediaFile(file,file.name);if('error' in result)throw Error(result.error);}resolve();}catch(e){reject(e);}};input.click();})} onCreate={()=>createBlankProject('sheets')} testId="sheets-empty"/></section></div></main>;
 return <main className="center" aria-label={t('sheets.workspace')}><div className="workspace"><section className="code-pane" aria-label={t('sheets.workspace')}><FileTabs/><Workbook key={item.url} item={item}/></section></div></main>;
}
function Workbook({item}:{item:MediaItem}){
 const {t}=useT();
 const engine=useRef<SheetsEngine|null>(null);const original=useRef<Uint8Array|null>(null);
 const [phase,setPhase]=useState<Phase>({kind:'loading'});const [book,setBook]=useState<WorkbookInfo|null>(null);
 const [sheet,setSheet]=useState(0);const [info,setInfo]=useState<SheetInfo|null>(null);
 const [sel,setSel]=useState({row:0,col:0});const [draft,setDraftState]=useState<string|null>(null);const draftRef=useRef<string|null>(null);const formulaRef=useRef<HTMLInputElement>(null);
 const setDraft=(v:string|null)=>{draftRef.current=v;setDraftState(v);};
 const startEdit=(v:string)=>{setDraft(v);requestAnimationFrame(()=>{const el=formulaRef.current;if(el){el.focus();el.setSelectionRange(v.length,v.length);}});};
 const [cells,setCells]=useState<Map<string,ViewCell>>(new Map());const [layout,setLayout]=useState<SheetLayout|null>(null);const [rev,setRev]=useState(0);const [dirty,setDirty]=useState(false);
 const [notice,setNotice]=useState('');const [view,setView]=useState({w:800,h:400,top:0,left:0});
 const scroller=useRef<HTMLDivElement>(null);
 const fail=useCallback((e:unknown)=>{const message=e instanceof Error?e.message:String(e);if(engine.current?.isDisposed)setPhase({kind:'error',message});else setNotice(message);},[]);
 // Open: the engine gets a copy; the original bytes stay here for recovery.
 useEffect(()=>{let live=true;const eng=new SheetsEngine();engine.current=eng;
  (async()=>{try{const buf=await (await fetch(item.url)).arrayBuffer();const bytes=new Uint8Array(buf);original.current=bytes;const opened=await eng.open(bytes);if(!live)return;setBook(opened);setPhase({kind:'ready'});}catch(e){if(live)setPhase({kind:'error',message:e instanceof Error?e.message:String(e)});}})();
  return()=>{live=false;eng.dispose();engine.current=null;setSheetsSelection(null);};},[item.url]);
 // Sheet info (used range, history flags) after open, sheet switch and every edit.
 useEffect(()=>{if(phase.kind!=='ready')return;let live=true;engine.current?.info(sheet).then(i=>{if(live)setInfo(i);}).catch(fail);return()=>{live=false;};},[phase,sheet,rev,fail]);
 useEffect(()=>{if(phase.kind!=='ready')return;let live=true;engine.current?.layout(sheet).then(l=>{if(live)setLayout(l);}).catch(fail);return()=>{live=false;};},[phase,sheet,fail]);
 const totalRows=Math.max(100,(info?.rows??0)+50),totalCols=Math.max(26,(info?.cols??0)+6);
 const geo=useMemo(()=>new Geometry(layout,totalRows,totalCols),[layout,totalRows,totalCols]);
 // Bounded viewport read (values, formats and styles) for the visible window only.
 const win=useMemo(()=>geo.window(view.top,view.left,view.w-HEAD_W,view.h-HEAD_H),[geo,view]);
 useEffect(()=>{if(phase.kind!=='ready'||!engine.current)return;let live=true;const eng=engine.current;const fr=geo.freezeRows,fc=geo.freezeCols;
  // Main window plus the frozen strips, so frozen rows/columns stay painted while scrolling.
  const rects=[win];if(fr>0)rects.push({row:0,col:win.col,rows:fr,cols:win.cols});if(fc>0)rects.push({row:win.row,col:0,rows:win.rows,cols:fc});if(fr>0&&fc>0)rects.push({row:0,col:0,rows:fr,cols:fc});
  Promise.all(rects.map(w=>eng.view(sheet,w.row,w.col,Math.max(1,Math.min(w.rows,100)),Math.max(1,Math.min(w.cols,60))))).then(rs=>{if(!live)return;const m=new Map<string,ViewCell>();for(const r of rs)for(const c of r.cells)m.set(c.address,c);setCells(m);}).catch(fail);return()=>{live=false;};},[phase,sheet,win,geo,rev,fail]);
 useEffect(()=>{const el=scroller.current;if(!el)return;const measure=()=>setView(v=>({...v,w:el.clientWidth,h:el.clientHeight}));measure();const ro=new ResizeObserver(measure);ro.observe(el);return()=>ro.disconnect();},[phase.kind]);
 const address=addressOf(sel.row,sel.col);const cur=cells.get(address);
 useEffect(()=>{if(phase.kind!=='ready')return;setSheetsSelection({file:item.name,sheet,sheetName:book?.sheets[sheet]?.name??'',address,kind:cur?.value.t??'Empty',text:displayValue(cur?.value),formula:cur?.formula??null,dirty,canUndo:!!info?.canUndo,canRedo:!!info?.canRedo});},[phase.kind,item.name,sheet,book,address,cur,dirty,info]);
 const commit=async(input:string)=>{
  setDraft(null);if(new TextEncoder().encode(input).length>MAX_CELL_BYTES){setNotice(t('sheets.tooLong'));return;}
  const before=editText(cur?.value,cur?.formula);if(input===before)return;
  try{await engine.current!.set(sheet,address,input);setDirty(true);setNotice('');setRev(r=>r+1);}catch(e){fail(e);}};
 const move=(dr:number,dc:number)=>setSel(s=>{let row=s.row,col=s.col;const step=(v:number,d:number,max:number,size:(i:number)=>number)=>{let n=v;for(let k=0;k<max&&d!==0;k++){const t=n+d;if(t<0||t>=max)break;n=t;if(size(t)>0)break;}return n;};
   row=step(row,dr,totalRows,r=>geo.rowHeight(r));col=step(col,dc,totalCols,c=>geo.colWidth(c));
   const next={row,col};const el=scroller.current;if(el){const top=geo.rowTop(row),left=geo.colLeft(col),h=geo.rowHeight(row),w=geo.colWidth(col);if(top<el.scrollTop)el.scrollTop=top;else if(top+h>el.scrollTop+el.clientHeight-HEAD_H)el.scrollTop=top+h-el.clientHeight+HEAD_H;if(left<el.scrollLeft)el.scrollLeft=left;else if(left+w>el.scrollLeft+el.clientWidth-HEAD_W)el.scrollLeft=left+w-el.clientWidth+HEAD_W;}return next;});
 const onGridKey=(e:KeyboardEvent)=>{
  if(draft!==null)return;
  const k=e.key;
  if(k==='ArrowDown'){e.preventDefault();move(1,0);}else if(k==='ArrowUp'){e.preventDefault();move(-1,0);}else if(k==='ArrowRight'){e.preventDefault();move(0,1);}else if(k==='ArrowLeft'){e.preventDefault();move(0,-1);}
  else if(k==='Tab'){e.preventDefault();move(0,e.shiftKey?-1:1);}else if(k==='Enter'||k==='F2'){e.preventDefault();startEdit(editText(cur?.value,cur?.formula));}
  else if(k==='Delete'||k==='Backspace'){e.preventDefault();void commit('');}
  else if((e.ctrlKey||e.metaKey)&&k.toLowerCase()==='z'){e.preventDefault();void history(e.shiftKey?'redo':'undo');}
  else if((e.ctrlKey||e.metaKey)&&k.toLowerCase()==='y'){e.preventDefault();void history('redo');}
  else if(k.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();startEdit(k);}
 };
 const history=async(kind:'undo'|'redo')=>{try{await (kind==='undo'?engine.current!.undo():engine.current!.redo());setDirty(true);setRev(r=>r+1);}catch(e){fail(e);}};
 const side=(b:{w:number;style:string;color:string}|null|undefined)=>b?`${Math.max(1,Math.min(3,Math.round(b.w)))}px ${b.style} ${b.color}`:undefined;
 const renderCells=()=>{
  const fr=geo.freezeRows,fc=geo.freezeCols;const out:React.ReactNode[]=[];const seen=new Set<string>();
  const rowsList=[...new Set([...Array.from({length:fr},(_,i)=>i),...Array.from({length:win.rows},(_,i)=>win.row+i)])],colsList=[...new Set([...Array.from({length:fc},(_,i)=>i),...Array.from({length:win.cols},(_,j)=>win.col+j)])];
  for(const r of rowsList)for(const c of colsList){
   const box=geo.box(r,c);if(!box||box.width===0||box.height===0)continue;
   const a=addressOf(r,c);if(seen.has(a))continue;seen.add(a);const cell=cells.get(a);const selected=r===sel.row&&c===sel.col;const st=cell?.style;
   const frozenR=r<fr,frozenC=c<fc;const align=cellAlign(st?.h,cell);const bd=st?.borders;
   const css:React.CSSProperties={position:'absolute',left:HEAD_W+box.left+(frozenC?view.left:0),top:HEAD_H+box.top+(frozenR?view.top:0),width:box.width,height:box.height,textAlign:align,zIndex:frozenR&&frozenC?3:frozenR||frozenC?2:undefined,
    fontFamily:st?.font?`"${st.font}", system-ui, sans-serif`:undefined,fontSize:st?.size?`${Math.round(st.size*96/72*10)/10}px`:undefined,
    fontWeight:st?.bold?700:undefined,fontStyle:st?.italic?'italic':undefined,textDecoration:[st?.underline?'underline':'',st?.strike?'line-through':''].filter(Boolean).join(' ')||undefined,
    color:isErrorValue(cell?.value)?undefined:(cell?.fmtColor??st?.color??undefined),backgroundColor:st?.fill??((frozenR||frozenC)?'var(--surface, #fff)':undefined),
    borderLeft:side(bd?.l),borderRight:side(bd?.r),borderTop:side(bd?.t),borderBottom:side(bd?.b),boxSizing:'border-box',
    whiteSpace:st?.wrap?'pre-wrap':'nowrap',overflow:'hidden',textOverflow:st?.wrap?'clip':'ellipsis',lineHeight:st?.wrap?'16px':`${Math.max(16,box.height-1)}px`};
   out.push(<div key={a} role="gridcell" aria-selected={selected} aria-rowindex={r+1} aria-colindex={c+1} data-address={a} data-frozen={frozenR||frozenC?'true':undefined} data-merged={geo.mergeCovering(r,c)?'true':undefined}
    className={'border-b border-r border-subtle px-1.5 text-[12px] '+(selected?(st?.fill?'':'bg-hover ')+'outline outline-2 -outline-offset-2 outline-accent':'')+(isErrorValue(cell?.value)?' text-red-600':'')}
    style={css}
    onMouseDown={e=>{e.preventDefault();if(draftRef.current!==null)void commit(draftRef.current);setSel({row:r,col:c});scroller.current?.focus();}} onDoubleClick={()=>startEdit(editText(cell?.value,cell?.formula))}>{cellText(cell)}</div>);}
  return out;};
 const exportCopy=async()=>{try{const bytes=await engine.current!.save();download(`${stem(item.name)}-edited.xlsx`,bytes);setNotice(t('sheets.exported'));}catch(e){fail(e);}};
 const restart=()=>{if(original.current)window.location.reload();};
 if(phase.kind==='error')return <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center" role="alert" data-testid="sheets-error"><p className="text-[13px] text-red-600">{phase.message}</p><p className="text-[12px] text-ink-3">{t('sheets.errorHint')}</p>{original.current&&<Button onClick={restart}>{t('sheets.reopen')}</Button>}</div>;
 const names=book?.sheets??[];
 return <section className="canvas-stage flex min-h-0 flex-1 flex-col" aria-label={t('sheets.workbook',{name:item.name})}>
  <div className="media-bar flex items-center gap-2 border-b border-subtle px-3 py-1.5 text-[12px]">
   <span className="truncate" data-testid="media-name">{item.name}</span><span className="text-ink-3">XLSX, {formatBytes(item.size)}</span>
   {dirty&&<span className="rounded-sm bg-hover px-1.5 text-ink-2" data-testid="sheets-dirty">{t('sheets.edited')}</span>}<span className="flex-1"/>
   <Button size="icon" aria-label={t('cmd.edit.undo')} title={t('cmd.edit.undo')} disabled={!info?.canUndo} onClick={()=>void history('undo')}><Undo2/></Button>
   <Button size="icon" aria-label={t('cmd.edit.redo')} title={t('cmd.edit.redo')} disabled={!info?.canRedo} onClick={()=>void history('redo')}><Redo2/></Button>
   <Button variant="outline" disabled={phase.kind!=='ready'} onClick={()=>void exportCopy()} data-testid="sheets-export">{t('sheets.exportCopy')}</Button>
  </div>
  {book&&book.warnings.length>0&&<ul className="px-3 py-1 text-[12px] text-ink-3" role="note" data-testid="sheets-warnings">{book.warnings.map(w=><li key={w}>{w}</li>)}</ul>}
  <p className="px-3 py-1 text-[12px] text-ink-3" role="note" data-testid="sheets-fidelity">{t('sheets.fidelity')}</p>
  {notice&&<p className="px-3 py-1 text-[12px] text-ink-2" role="status" data-testid="sheets-notice">{notice}</p>}
  <div className="flex w-full items-center gap-2 border-b border-subtle px-3 py-1">
   <span className="w-14 shrink-0 rounded-sm bg-hover px-2 py-0.5 text-center text-[12px]" data-testid="sheets-address" aria-label={t('sheets.address')}>{address}</span>
   <span className="text-ink-3" aria-hidden="true">fx</span>
   <input ref={formulaRef} aria-label={t('sheets.formulaBar')} data-testid="sheets-formula" className="h-7 min-w-0 flex-1 rounded-sm border border-subtle bg-transparent px-2 text-[12px]" spellCheck={false}
    value={draft??editText(cur?.value,cur?.formula)} onFocus={()=>{if(draftRef.current===null)setDraft(editText(cur?.value,cur?.formula));}} onChange={e=>setDraft(e.target.value)}
    onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void commit(draftRef.current??'').then(()=>{move(1,0);scroller.current?.focus();});}else if(e.key==='Escape'){e.preventDefault();setDraft(null);scroller.current?.focus();}}}
    onBlur={()=>{if(draftRef.current!==null)void commit(draftRef.current);}}/>
  </div>
  <div ref={scroller} role="grid" tabIndex={0} aria-label={t('sheets.grid',{sheet:names[sheet]?.name??''})} aria-rowcount={totalRows} aria-colcount={totalCols} data-testid="sheets-grid"
   className="relative min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-accent" onKeyDown={onGridKey}
   onScroll={e=>{const el=e.currentTarget;setView(v=>({...v,top:el.scrollTop,left:el.scrollLeft}));}}>
   <div style={{width:HEAD_W+geo.width,height:HEAD_H+geo.height,position:'relative'}}>
    <div style={{position:'sticky',top:0,zIndex:2,height:HEAD_H,width:HEAD_W+geo.width}} aria-hidden="false">
     {[...new Set([...Array.from({length:geo.freezeCols},(_,i)=>i),...Array.from({length:win.cols},(_,i)=>win.col+i)])].map(c=><div key={'h'+c} role="columnheader" aria-colindex={c+1} className="border-b border-r border-subtle bg-hover text-center text-[11px] leading-6 text-ink-3" style={{position:'absolute',left:HEAD_W+geo.colLeft(c)+(c<geo.freezeCols?view.left:0),top:0,zIndex:c<geo.freezeCols?2:undefined,width:geo.colWidth(c),height:HEAD_H,display:geo.colWidth(c)===0?'none':undefined}}>{colName(c)}</div>)}
    </div>
    <div style={{position:'sticky',left:0,zIndex:1,width:HEAD_W,height:0}}>
     {[...new Set([...Array.from({length:geo.freezeRows},(_,i)=>i),...Array.from({length:win.rows},(_,i)=>win.row+i)])].map(r=><div key={'r'+r} role="rowheader" aria-rowindex={r+1} className="border-b border-r border-subtle bg-hover text-center text-[11px] leading-6 text-ink-3" style={{position:'absolute',left:0,top:geo.rowTop(r)+(r<geo.freezeRows?view.top:0),zIndex:r<geo.freezeRows?2:undefined,width:HEAD_W,height:geo.rowHeight(r),display:geo.rowHeight(r)===0?'none':undefined}}>{r+1}</div>)}
    </div>
    <div aria-hidden="true" className="border-b border-r border-subtle bg-hover" style={{position:'sticky',left:0,top:0,zIndex:3,width:HEAD_W,height:HEAD_H,marginTop:-HEAD_H}}/>
    {renderCells()}
   </div>
  </div>
  <div role="tablist" aria-label={t('sheets.tabs')} className="flex w-full gap-1 border-t border-subtle px-3 py-1">
   {names.filter(s=>s.visibility==='Visible').map(s=><button key={s.index} role="tab" aria-selected={s.index===sheet} className={'h-7 cursor-pointer rounded-sm border-0 bg-transparent px-2 text-[12px] text-ink-2 hover:bg-hover'+(s.index===sheet?' bg-hover font-semibold':'')} onClick={()=>{setSheet(s.index);setSel({row:0,col:0});setDraft(null);scroller.current?.scrollTo(0,0);}}>{s.name}</button>)}
  </div>
 </section>;
}
