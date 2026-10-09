import {useCallback,useEffect,useMemo,useRef,useState,type KeyboardEvent} from 'react';
import {FileTabs} from '../FileTabs';
import {Button} from '../ui/button';
import {Redo2,Undo2} from '../../lib/icons';
import {formatBytes,useMedia,type MediaItem} from '../../lib/media';
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
 if(!item)return <main className="center" aria-label={t('sheets.workspace')}><div className="workspace"><section className="code-pane" aria-label={t('sheets.workspace')}><FileTabs/><div className="grid flex-1 place-items-center p-6 text-center text-[13px] text-ink-3" role="status" data-testid="sheets-empty">{t('sheets.empty')}</div></section></div></main>;
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
 useEffect(()=>{if(phase.kind!=='ready')return;let live=true;engine.current?.view(sheet,win.row,win.col,win.rows,win.cols).then(r=>{if(!live)return;const m=new Map<string,ViewCell>();for(const c of r.cells)m.set(c.address,c);setCells(m);}).catch(fail);return()=>{live=false;};},[phase,sheet,win,rev,fail]);
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
     {Array.from({length:win.cols},(_,i)=>win.col+i).map(c=><div key={'h'+c} role="columnheader" aria-colindex={c+1} className="border-b border-r border-subtle bg-hover text-center text-[11px] leading-6 text-ink-3" style={{position:'absolute',left:HEAD_W+geo.colLeft(c),top:0,width:geo.colWidth(c),height:HEAD_H,display:geo.colWidth(c)===0?'none':undefined}}>{colName(c)}</div>)}
    </div>
    <div style={{position:'sticky',left:0,zIndex:1,width:HEAD_W,height:0}}>
     {Array.from({length:win.rows},(_,i)=>win.row+i).map(r=><div key={'r'+r} role="rowheader" aria-rowindex={r+1} className="border-b border-r border-subtle bg-hover text-center text-[11px] leading-6 text-ink-3" style={{position:'absolute',left:0,top:geo.rowTop(r),width:HEAD_W,height:geo.rowHeight(r),display:geo.rowHeight(r)===0?'none':undefined}}>{r+1}</div>)}
    </div>
    <div aria-hidden="true" className="border-b border-r border-subtle bg-hover" style={{position:'sticky',left:0,top:0,zIndex:3,width:HEAD_W,height:HEAD_H,marginTop:-HEAD_H}}/>
    {Array.from({length:win.rows},(_,i)=>win.row+i).flatMap(r=>Array.from({length:win.cols},(_,j)=>win.col+j).map(c=>{
     const w=geo.colWidth(c),h=geo.rowHeight(r);if(w===0||h===0)return null;
     const a=addressOf(r,c);const cell=cells.get(a);const selected=r===sel.row&&c===sel.col;const st=cell?.style;
     const align=cellAlign(st?.h,cell);
     const css:React.CSSProperties={position:'absolute',left:HEAD_W+geo.colLeft(c),top:HEAD_H+geo.rowTop(r),width:w,height:h,textAlign:align,
      fontWeight:st?.bold?700:undefined,fontStyle:st?.italic?'italic':undefined,textDecoration:[st?.underline?'underline':'',st?.strike?'line-through':''].filter(Boolean).join(' ')||undefined,
      color:isErrorValue(cell?.value)?undefined:(cell?.fmtColor??st?.color??undefined),backgroundColor:st?.fill??undefined,
      whiteSpace:st?.wrap?'pre-wrap':'nowrap',overflow:'hidden',textOverflow:st?.wrap?'clip':'ellipsis',lineHeight:st?.wrap?'16px':`${Math.max(16,h-1)}px`};
     return <div key={a} role="gridcell" aria-selected={selected} aria-rowindex={r+1} aria-colindex={c+1} data-address={a}
      className={'border-b border-r border-subtle px-1.5 text-[12px] '+(selected?(st?.fill?'':'bg-hover ')+'outline outline-2 -outline-offset-2 outline-accent':'')+(isErrorValue(cell?.value)?' text-red-600':'')}
      style={css}
      onMouseDown={e=>{e.preventDefault();if(draftRef.current!==null)void commit(draftRef.current);setSel({row:r,col:c});scroller.current?.focus();}} onDoubleClick={()=>startEdit(editText(cell?.value,cell?.formula))}>{cellText(cell)}</div>;}))}
   </div>
  </div>
  <div role="tablist" aria-label={t('sheets.tabs')} className="flex w-full gap-1 border-t border-subtle px-3 py-1">
   {names.filter(s=>s.visibility==='Visible').map(s=><button key={s.index} role="tab" aria-selected={s.index===sheet} className={'h-7 cursor-pointer rounded-sm border-0 bg-transparent px-2 text-[12px] text-ink-2 hover:bg-hover'+(s.index===sheet?' bg-hover font-semibold':'')} onClick={()=>{setSheet(s.index);setSel({row:0,col:0});setDraft(null);scroller.current?.scrollTo(0,0);}}>{s.name}</button>)}
  </div>
 </section>;
}
