import '../../lib/sheets/panelI18n';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useT} from '../../lib/useT';
import {usePanelState} from '../../store/panelStateStore';
import {useSheetsSelection} from '../../lib/sheets/sheetsStore';
import {sheetsPanelDefs} from '../../lib/sheets/panels';
import type {PanelHostProps} from '../../lib/shell/types';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {aggregateFormula,FORMULA_FUNCTIONS,parsePanelRange,rangeAddress,summarizeCells} from '../../lib/sheets/panelModel';
import {inRect,rectCells} from '../../lib/sheets/clipboard';
import {parseAddress} from '../../lib/sheets/format';
import type {RangeCell} from '../../lib/sheets/protocol';
const field='w-full min-w-0 rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink';
const button='rounded-lg border border-subtle px-2 py-1.5 text-ink hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed';
function Region({children}:{children:ReactNode}){return <div className="flex min-w-0 flex-col gap-3 p-3 text-[12px]" data-testid="sheets-panel-content">{children}</div>;}
function Facts({values}:{values:readonly [string,ReactNode][]}){return <dl className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-2 gap-y-1">{values.map(([label,value])=><div className="contents" key={label}><dt className="break-words text-ink-3">{label}</dt><dd className="min-w-0 break-words text-ink">{value??'–'}</dd></div>)}</dl>;}
function usePanelWorkbook(context:PanelHostProps['context']){const s=useSheetsSelection();return context.studio==='sheets'&&s&&(!context.document||context.document.id===s.file)?s:null;}
function useAction(){const {t}=useT();const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);return {notice,busy,setNotice,run:async(id:string,params?:unknown)=>{setBusy(true);setNotice('');try{return await commandDispatcher.runCommand(id,params,{origin:'ui'});}catch{setNotice(t('sheets.panel.failed'));return null;}finally{setBusy(false);}}};}
export function SheetsWorkbookPanel({context}:PanelHostProps){
 const {t}=useT(),s=usePanelWorkbook(context);const [filter,setFilter]=usePanelState('sheets.workbook.filter','');const [address,setAddress]=useState('A1');const action=useAction();
 if(!s)return <Region><p>{t('sheets.panel.none')}</p></Region>;
 const sheets=s.workbook?.sheets.filter(sheet=>sheet.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()))??[];
 return <Region><p className="break-all font-semibold">{s.file}</p>
 <input className={field} aria-label={t('sheets.panel.filter')} placeholder={t('sheets.panel.filter')} value={filter} onChange={e=>setFilter(e.target.value)}/>
 <div className="flex flex-col gap-1" role="group" aria-label={t('sheets.tabs')}>{sheets.map(sheet=><button className={button+' text-left'} key={sheet.index} disabled={sheet.visibility!=='Visible'||action.busy} aria-pressed={sheet.index===s.sheet} onClick={()=>void action.run('sheets.navigate',{sheet:sheet.index,address:'A1'})}>{sheet.name}{sheet.visibility!=='Visible'&&<span className="ml-2 text-ink-3">{t('sheets.panel.hidden')}</span>}</button>)}{!sheets.length&&<p>{t('sheets.panel.noMatches')}</p>}</div>
 <form className="flex gap-1" onSubmit={e=>{e.preventDefault();void action.run('sheets.navigate',{sheet:s.sheet,address});}}><input className={field} aria-label={t('sheets.address')} value={address} onChange={e=>setAddress(e.target.value)} autoCapitalize="characters"/><button className={button} disabled={action.busy||!parseAddress(address)}>{t('sheets.panel.go')}</button></form>
 <Facts values={[[t('sheets.panel.rows'),s.info?.rows],[t('sheets.panel.cols'),s.info?.cols],[t('sheets.panel.merges'),s.layout?.merges.length],[t('sheets.panel.frozen'),`${s.layout?.freeze?.rows??0} / ${s.layout?.freeze?.cols??0}`]]}/>
 <div className="flex flex-wrap gap-1"><button className={button} disabled={!s.canUndo||action.busy} onClick={()=>void action.run('sheets.undo')}>{t('cmd.edit.undo')}</button><button className={button} disabled={!s.canRedo||action.busy} onClick={()=>void action.run('sheets.redo')}>{t('cmd.edit.redo')}</button><button className={button} disabled={action.busy} onClick={()=>void action.run('sheets.saveCopy')}>{t('sheets.exportCopy')}</button></div>
 {!!s.workbook?.warnings.length&&<ul className="list-inside list-disc text-ink-3">{s.workbook.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>}<p role="status">{action.notice}</p></Region>;
}
export function SheetsCellPanel({context}:PanelHostProps){
 const {t}=useT(),s=usePanelWorkbook(context);const action=useAction();const [input,setInput]=useState('');
 useEffect(()=>setInput(s?.formula?'='+s.formula.replace(/^=/,''):s?.text??''),[s?.file,s?.sheet,s?.address,s?.text,s?.formula]);
 if(!s)return <Region><p>{t('sheets.panel.none')}</p></Region>;
 return <Region><Facts values={[[t('sheets.inspector.sheet'),s.sheetName],[t('sheets.address'),s.address],[t('sheets.inspector.type'),s.kind],[t('sheets.inspector.value'),s.text],[t('sheets.panel.format'),s.style?.fmt],[t('sheets.panel.font'),s.style?`${s.style.font} ${s.style.size} pt`:null]]}/>
 <form className="flex flex-col gap-2" onSubmit={e=>{e.preventDefault();void action.run('sheets.setCell',{input}).then(result=>{if(result!==null)action.setNotice(t('sheets.panel.applied'));});}}><label className="flex flex-col gap-1">{t('sheets.panel.input')}<textarea className={field+' min-h-24 resize-y'} value={input} onChange={e=>setInput(e.target.value)} spellCheck={false}/></label><button className={button} disabled={action.busy||context.document?.readOnly}>{t('sheets.panel.apply')}</button></form><p role="status">{action.notice}</p></Region>;
}
export function SheetsAnalysisPanel({context}:PanelHostProps){
 const {t,locale}=useT(),s=usePanelWorkbook(context);const action=useAction();const [range,setRange]=usePanelState('sheets.analysis.range','A1:A10');
 const [result,setResult]=useState<{stats:ReturnType<typeof summarizeCells>;identity:string;revision:number;range:string}|null>(null);const sequence=useRef(0);
 const identity=s?`${s.file}:${s.sheet}`:'';const identityRef=useRef(identity);identityRef.current=identity;
 if(!s)return <Region><p>{t('sheets.panel.none')}</p></Region>;
 const valid=parsePanelRange(range);const stats=result?.identity===identity?result.stats:null;
 const analyze=async()=>{if(!valid)return;const seq=++sequence.current;const id=identity,revision=s.revision??0;const cells=await action.run('sheets.analyzeRange',{range});if(cells&&seq===sequence.current&&id===identityRef.current)setResult({stats:summarizeCells(cells as RangeCell[],rectCells(valid)),identity:id,revision,range});};
 return <Region><form className="flex flex-col gap-2" onSubmit={e=>{e.preventDefault();void analyze();}}><label className="flex flex-col gap-1">{t('sheets.panel.range')}<input className={field} value={range} onChange={e=>setRange(e.target.value)}/></label><div className="flex flex-wrap gap-1"><button className={button} disabled={!valid||action.busy}>{t('sheets.panel.analyze')}</button><button className={button} type="button" onClick={()=>setRange(s.range?rangeAddress(s.range):s.address)}>{t('sheets.panel.follow')}</button></div></form>
 {stats&&<><p className="break-all font-semibold">{result?.range}</p>{result?.revision!==(s.revision??0)&&<p role="status">{t('sheets.panel.stale')}</p>}<Facts values={Object.entries(stats).map(([key,value])=>[t('sheets.panel.'+(key==='formulas'?'formulaCount':key)),typeof value==='number'?new Intl.NumberFormat(locale,{maximumFractionDigits:8}).format(value):null])}/></>}<p role="status">{action.notice}</p></Region>;
}
export function SheetsFormulasPanel({context}:PanelHostProps){
 const {t}=useT(),s=usePanelWorkbook(context);const action=useAction();const [fn,setFn]=usePanelState('sheets.formulas.function','SUM');const [source,setSource]=usePanelState('sheets.formulas.source','A1:A10');
 if(!s)return <Region><p>{t('sheets.panel.none')}</p></Region>;
 const range=parsePanelRange(source),target=parseAddress(s.address);const circular=!!range&&!!target&&inRect(range,target.row,target.col);let formula='';try{formula=aggregateFormula(fn,source);}catch{/* invalid source disables apply */}
 return <Region><label className="flex flex-col gap-1">{t('sheets.panel.function')}<select className={field} value={fn} onChange={e=>setFn(e.target.value)}>{FORMULA_FUNCTIONS.map(f=><option key={f}>{f}</option>)}</select></label><label className="flex flex-col gap-1">{t('sheets.panel.source')}<input className={field} value={source} onChange={e=>setSource(e.target.value)}/></label><button className={button} onClick={()=>setSource(s.range?rangeAddress(s.range):s.address)}>{t('sheets.panel.follow')}</button><code className="break-all rounded-lg bg-hover p-2">{formula||'...'}</code><p className="text-ink-3">{t('sheets.panel.targetWarning')}</p>{circular&&<p role="alert">{t('sheets.panel.circular')}</p>}<p>{t('sheets.address')}: {s.address}</p><button className={button} disabled={!formula||circular||action.busy||context.document?.readOnly} onClick={()=>void action.run('sheets.setCell',{input:formula}).then(result=>{if(result!==null)action.setNotice(t('sheets.panel.applied'));})}>{t('sheets.panel.apply')}</button><p role="status">{action.notice}</p></Region>;
}
