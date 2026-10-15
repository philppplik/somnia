import '../../lib/sheets/panelI18n';
import {useEffect,useRef,useState,useSyncExternalStore,type ReactNode} from 'react';
import {useT} from '../../lib/useT';
import {usePanelState} from '../../store/panelStateStore';
import {getSheetsSelection,subscribeSheets,useSheetsSelection} from '../../lib/sheets/sheetsStore';
import {getFormulasFocusRequest,subscribeFormulasFocus} from '../../lib/sheets/formulasFocus';
import {cellHasContent,formulaTargetProblem} from '../../lib/sheets/formulaTarget';
import {sheetsPanelDefs} from '../../lib/sheets/panels';
import type {PanelHostProps,InspectorSectionProps} from '../../lib/shell/types';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {aggregateFormula,FORMULA_FUNCTIONS,parsePanelRange,rangeAddress,summarizeCells} from '../../lib/sheets/panelModel';
import {rectCells} from '../../lib/sheets/clipboard';
import {addressOf,colName,parseAddress} from '../../lib/sheets/format';
import {sortBlockProblem} from '../../lib/sheets/sortOps';
import {fillBlockProblem,FILL_DIRECTIONS} from '../../lib/sheets/fillOps';
import type {FillDirection} from '../../lib/sheets/protocol';
import {FILTER_CONDITIONS,MAX_FILTER_VALUE,filterValueProblem} from '../../lib/sheets/filterOps';
import {MAX_SHEETS,sheetNameProblem} from '../../lib/sheets/sheetOps';
import type {BorderLineStyle,FilterCondition,RangeCell} from '../../lib/sheets/protocol';
import {colWidthPx,rowHeightPx,MAX_COL_PX,MAX_ROW_PX,MAX_FREEZE} from '../../lib/sheets/lineOps';
import {BORDER_PRESETS,BORDER_STYLES,DEFAULT_BORDER_COLOR,H_ALIGNS,V_ALIGNS,CURRENCY_SYMBOLS,DECIMAL_PRESETS,MAX_DECIMALS,NUM_PRESETS,detectNumFmt,DEFAULT_FILL_COLOR,DEFAULT_TEXT_COLOR,FONT_NAMES,FONT_SIZES,MAX_FONT_SIZE,MIN_FONT_SIZE,isHexColor,toggleOp,type ToggleKind} from '../../lib/sheets/formatOps';
import {Button} from '../ui/button';
import {NativeInput,NativeSelect} from '../ui/native-controls';
import {NumberField} from '../ui/number-field';
const MAX_SORT_OPTIONS=100;
const field='w-full min-w-0 rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink';
const button='rounded-lg border border-subtle px-2 py-1.5 text-ink hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed';
function Region({children}:{children:ReactNode}){return <div className="flex min-w-0 flex-col gap-3 p-3 text-[12px]" data-testid="sheets-panel-content">{children}</div>;}
function Facts({values}:{values:readonly [string,ReactNode][]}){return <dl className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-2 gap-y-1">{values.map(([label,value])=><div className="contents" key={label}><dt className="break-words text-ink-3">{label}</dt><dd className="min-w-0 break-words text-ink">{value??'–'}</dd></div>)}</dl>;}
function usePanelWorkbook(context:PanelHostProps['context']){const s=useSheetsSelection();return context.studio==='sheets'&&s&&(!context.document||context.document.id===s.file)?s:null;}
function useAction(){const {t}=useT();const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);return {notice,busy,setNotice,run:async(id:string,params?:unknown)=>{setBusy(true);setNotice('');try{return await commandDispatcher.runCommand(id,params,{origin:'ui'});}catch{setNotice(t('sheets.panel.failed'));return null;}finally{setBusy(false);}}};}
export function SheetsWorkbookPanel({context}:PanelHostProps){
 const {t}=useT(),s=usePanelWorkbook(context);const [filter,setFilter]=usePanelState('sheets.workbook.filter','');const [address,setAddress]=useState('A1');const action=useAction();const [name,setName]=useState('');
 useEffect(()=>setName(s?.sheetName??''),[s?.file,s?.sheet,s?.sheetName]);
 if(!s)return <Region><p>{t('sheets.panel.none')}</p></Region>;
 const sheetList=s.workbook?.sheets??[],visibleCount=sheetList.filter(x=>x.visibility==='Visible').length,nameProblem=sheetNameProblem(name);
 const sheets=s.workbook?.sheets.filter(sheet=>sheet.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()))??[];
 return <Region><p className="break-all font-semibold">{s.file}</p>
 <input className={field} aria-label={t('sheets.panel.filter')} placeholder={t('sheets.panel.filter')} value={filter} onChange={e=>setFilter(e.target.value)}/>
 <div className="flex flex-col gap-1" role="group" aria-label={t('sheets.tabs')}>{sheets.map(sheet=><button className={button+' text-left'} key={sheet.index} disabled={sheet.visibility!=='Visible'||action.busy} aria-pressed={sheet.index===s.sheet} onClick={()=>void action.run('sheets.navigate',{sheet:sheet.index,address:'A1'})}>{sheet.name}{sheet.visibility!=='Visible'&&<span className="ml-2 text-ink-3">{t('sheets.panel.hidden')}</span>}</button>)}{!sheets.length&&<p>{t('sheets.panel.noMatches')}</p>}</div>
 <form className="flex gap-1" onSubmit={e=>{e.preventDefault();void action.run('sheets.navigate',{sheet:s.sheet,address});}}><input className={field} aria-label={t('sheets.address')} value={address} onChange={e=>setAddress(e.target.value)} autoCapitalize="characters"/><button className={button} disabled={action.busy||!parseAddress(address)}>{t('sheets.panel.go')}</button></form>
 <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.sheetOps.title')}>
  <form className="flex flex-col gap-1" onSubmit={e=>{e.preventDefault();if(!nameProblem)void action.run('sheets.sheet',{kind:'rename',name:name.trim()});}}>
   <label className="flex flex-col gap-1">{t('sheets.sheetOps.name')}<NativeInput className={field} value={name} maxLength={64} aria-invalid={!!nameProblem} onChange={e=>setName(e.currentTarget.value)} data-testid="sheets-sheet-name"/></label>
   {nameProblem&&name.trim()!==s.sheetName&&<p role="alert" className="text-ink-3">{t('sheets.sheetOps.problem.'+nameProblem)}</p>}
   <Button variant="outline" size="compact" type="submit" disabled={action.busy||!!nameProblem||name.trim()===s.sheetName} data-testid="sheets-sheet-rename">{t('sheets.sheetOps.rename')}</Button>
  </form>
  <div className="flex flex-wrap gap-1">
   <Button variant="outline" size="compact" disabled={action.busy||sheetList.length>=MAX_SHEETS} onClick={()=>void action.run('sheets.sheet',{kind:'add'})} data-testid="sheets-sheet-add">{t('sheets.sheetOps.add')}</Button>
   <Button variant="outline" size="compact" disabled={action.busy||sheetList.length>=MAX_SHEETS} onClick={()=>void action.run('sheets.sheet',{kind:'duplicate'})} data-testid="sheets-sheet-duplicate">{t('sheets.sheetOps.duplicate')}</Button>
   <Button variant="outline" size="compact" disabled={action.busy||s.sheet<=0} onClick={()=>void action.run('sheets.sheet',{kind:'move',to:s.sheet-1})} data-testid="sheets-sheet-left">{t('sheets.sheetOps.moveLeft')}</Button>
   <Button variant="outline" size="compact" disabled={action.busy||s.sheet>=sheetList.length-1} onClick={()=>void action.run('sheets.sheet',{kind:'move',to:s.sheet+1})} data-testid="sheets-sheet-right">{t('sheets.sheetOps.moveRight')}</Button>
   <Button variant="outline" size="compact" disabled={action.busy||visibleCount<=1} onClick={()=>void action.run('sheets.sheet',{kind:'delete'})} data-testid="sheets-sheet-delete">{t('sheets.sheetOps.delete')}</Button>
  </div>
 </div>
 <Facts values={[[t('sheets.panel.rows'),s.info?.rows],[t('sheets.panel.cols'),s.info?.cols],[t('sheets.panel.merges'),s.layout?.merges.length],[t('sheets.panel.frozen'),`${s.layout?.freeze?.rows??0} / ${s.layout?.freeze?.cols??0}`]]}/>
 <div className="flex flex-wrap gap-1"><button className={button} disabled={!s.canUndo||action.busy} onClick={()=>void action.run('sheets.undo')}>{t('cmd.edit.undo')}</button><button className={button} disabled={!s.canRedo||action.busy} onClick={()=>void action.run('sheets.redo')}>{t('cmd.edit.redo')}</button><button className={button} disabled={action.busy} onClick={()=>void action.run('sheets.saveCopy')}>{t('sheets.exportCopy')}</button></div>
 {!!s.workbook?.warnings.length&&<ul className="list-inside list-disc text-ink-3">{s.workbook.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>}<p role="status">{action.notice}</p></Region>;
}
export function SheetsCellPanel({context}:PanelHostProps){
 const {t}=useT(),s=usePanelWorkbook(context);const action=useAction();const [input,setInput]=useState('');
 useEffect(()=>setInput(s?.formula?'='+s.formula.replace(/^=/,''):s?.text??''),[s?.file,s?.sheet,s?.address,s?.text,s?.formula]);
 if(!s)return <Region><p>{t('sheets.panel.none')}</p></Region>;
 return <Region><Facts values={[[t('sheets.inspector.sheet'),s.sheetName],[t('sheets.address'),<span data-testid="sheets-inspector-address">{s.address}</span>],[t('sheets.inspector.type'),s.kind],[t('sheets.inspector.value'),s.text],[t('sheets.panel.format'),s.style?.fmt],[t('sheets.panel.font'),s.style?`${s.style.font} ${s.style.size} pt`:null]]}/>
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
/** Waits until the live selection actually lands on the reviewed target; false when it never does. */
function waitForSelection(file:string,sheet:number,address:string):Promise<boolean>{
 const hit=()=>{const l=getSheetsSelection();return !!l&&l.file===file&&l.sheet===sheet&&l.address===address;};
 if(hit())return Promise.resolve(true);
 return new Promise(resolve=>{
  const timer=setTimeout(()=>{off();resolve(false);},2000);
  const off=subscribeSheets(()=>{if(hit()){clearTimeout(timer);off();resolve(true);}});
 });
}
/**
 * Formula builder (Smart Formula hero, docs/concepts/hero-action-sheets.md). Review before write:
 * an explicit target cell outside the source range is required, a non-empty target asks before it is
 * replaced, and Apply navigates to the reviewed target (settling pending edits) and dispatches
 * `sheets.setCell` exactly once. Undo is `sheets.undo`; nothing saves, exports or leaves the machine.
 */
export function SheetsFormulasPanel({context}:PanelHostProps){
 const {t}=useT(),s=usePanelWorkbook(context);const action=useAction();
 const [fn,setFn]=usePanelState('sheets.formulas.function','SUM');
 const [source,setSource]=usePanelState('sheets.formulas.source','A1:A10');
 const [target,setTarget]=usePanelState('sheets.formulas.target','');
 const [replaceTarget,setReplaceTarget]=useState<string|null>(null);
 const fnField=useRef<HTMLSelectElement>(null);
 const focusRequest=useSyncExternalStore(subscribeFormulasFocus,getFormulasFocusRequest,getFormulasFocusRequest);
 useEffect(()=>{if(focusRequest>0)fnField.current?.focus();},[focusRequest]);
 if(!s)return <Region><p>{t('sheets.panel.none')}</p></Region>;
 let formula='';try{formula=aggregateFormula(fn,source);}catch{/* invalid source disables apply */}
 const problem=formulaTargetProblem(source,target);
 const parsed=parseAddress(target);const canonical=parsed?addressOf(parsed.row,parsed.col):'';
 const confirming=replaceTarget!==null&&replaceTarget===canonical;
 const apply=async(replace:boolean)=>{
  if(!formula||problem||!parsed)return;
  const file=s.file,sheet=s.sheet;
  setReplaceTarget(null);
  if(!replace){
   // Read the target back: warn before replacing content instead of overwriting silently.
   const cells=await action.run('sheets.analyzeRange',{range:canonical});
   if(!cells)return;
   if(cellHasContent((cells as RangeCell[])[0])){setReplaceTarget(canonical);return;}
  }
  // Settle pending grid/formula-bar edits, then make the reviewed target the current cell.
  if(!await action.run('sheets.navigate',{sheet,address:canonical}))return;
  // Invalidate the proposal when the selection did not land on the reviewed target.
  if(!await waitForSelection(file,sheet,canonical)){action.setNotice(t('sheets.panel.failed'));return;}
  await action.run('sheets.setCell',{input:formula}).then(result=>{if(result!==null)action.setNotice(t('sheets.panel.applied'));});
 };
 return <Region><label className="flex flex-col gap-1">{t('sheets.panel.function')}<select ref={fnField} className={field} value={fn} onChange={e=>setFn(e.target.value)}>{FORMULA_FUNCTIONS.map(f=><option key={f}>{f}</option>)}</select></label><label className="flex flex-col gap-1">{t('sheets.panel.source')}<input className={field} value={source} onChange={e=>setSource(e.target.value)}/></label><button className={button} onClick={()=>setSource(s.range?rangeAddress(s.range):s.address)}>{t('sheets.panel.follow')}</button><code className="break-all rounded-lg bg-hover p-2">{formula||'...'}</code><label className="flex flex-col gap-1">{t('sheets.panel.target')}<input className={field} value={target} onChange={e=>{setTarget(e.target.value);setReplaceTarget(null);}} placeholder="B3" data-testid="sheets-formula-target" autoCapitalize="characters" spellCheck={false}/></label><button className={button} onClick={()=>{setTarget(s.address);setReplaceTarget(null);}}>{t('sheets.panel.useCell')}</button><p className="text-ink-3">{t('sheets.panel.targetWarning')}</p>{problem==='empty'&&<p className="text-ink-3">{t('sheets.panel.targetEmpty')}</p>}{problem==='invalid'&&<p role="alert">{t('sheets.panel.targetInvalid')}</p>}{problem==='circular'&&<p role="alert">{t('sheets.panel.circular')}</p>}{confirming&&<div role="alert" className="flex flex-col gap-2 rounded-lg border border-subtle p-2" data-testid="sheets-formula-replace"><p>{t('sheets.panel.replaceConfirm',{address:canonical})}</p><div className="flex gap-1"><button className={button} disabled={action.busy} onClick={()=>void apply(true)}>{t('sheets.panel.replace')}</button><button className={button} onClick={()=>setReplaceTarget(null)}>{t('sheets.panel.cancel')}</button></div></div>}<button className={button} disabled={!formula||problem!==null||action.busy||context.document?.readOnly} onClick={()=>void apply(false)} data-testid="sheets-formula-apply">{t('sheets.panel.applyFormula')}</button><p role="status">{action.notice}</p></Region>;
}

export function SheetsCellSection({sectionId,context}:InspectorSectionProps){return <SheetsCellPanel panelId={sectionId} context={context}/>;}
export function SheetsFormulasSection({sectionId,context}:InspectorSectionProps){return <SheetsFormulasPanel panelId={sectionId} context={context}/>;}

const TOGGLES:readonly {kind:ToggleKind;glyph:string;key:string;className:string}[]=[
 {kind:'bold',glyph:'B',key:'sheets.format.bold',className:'font-extrabold'},
 {kind:'italic',glyph:'I',key:'sheets.format.italic',className:'italic'},
 {kind:'underline',glyph:'U',key:'sheets.format.underline',className:'underline'},
 {kind:'strike',glyph:'S',key:'sheets.format.strike',className:'line-through'},
];
/** Font and fill formatting for the selected cells. Every control dispatches `sheets.format`: one operation, one undo step; nothing here edits cell values. */
export function SheetsFormatPanel({context}:PanelHostProps){
 const {t}=useT(),s=usePanelWorkbook(context);const action=useAction();
 const [border,setBorder]=useState<{style:BorderLineStyle;color:string}>({style:'thin',color:DEFAULT_BORDER_COLOR});
 const style=s?.style;const cellKey=s?`${s.file}:${s.sheet}:${s.address}`:'';
 // A picked color is kept only for the cell it was picked on; otherwise the pickers follow the active cell.
 const [picked,setPicked]=useState<{key:string;text?:string;fill?:string}>({key:''});const mine=picked.key===cellKey?picked:null;
 const textColor=mine?.text??(isHexColor(style?.color)?style!.color!.toUpperCase():DEFAULT_TEXT_COLOR),fillColor=mine?.fill??(isHexColor(style?.fill)?style!.fill!.toUpperCase():DEFAULT_FILL_COLOR);
 const setTextColor=(text:string)=>setPicked({...(mine??{key:cellKey}),key:cellKey,text}),setFillColor=(fill:string)=>setPicked({...(mine??{key:cellKey}),key:cellKey,fill});
 if(!s)return <Region><p>{t('sheets.panel.none')}</p></Region>;
 const send=(params:Record<string,unknown>)=>void action.run('sheets.format',params);
 const num=detectNumFmt(style?.fmt??'General');
 const fonts=style&&!(FONT_NAMES as readonly string[]).includes(style.font)?[style.font,...FONT_NAMES]:[...FONT_NAMES];
 return <Region>
  <div className="flex flex-wrap gap-1" role="group" aria-label={t('sheets.format.style')}>{TOGGLES.map(x=><Button key={x.kind} variant="outline" size="icon" className={x.className} aria-label={t(x.key)} aria-pressed={!!style?.[x.kind]} disabled={action.busy} onClick={()=>send(toggleOp(x.kind,style))} data-testid={'sheets-format-'+x.kind}><span className={x.className} aria-hidden="true">{x.glyph}</span></Button>)}</div>
  <label className="flex flex-col gap-1">{t('sheets.format.font')}<NativeSelect className={field} value={style?.font??''} disabled={action.busy||!style} onChange={e=>send({kind:'fontName',name:e.currentTarget.value})} data-testid="sheets-format-font">{fonts.map(f=><option key={f} value={f}>{f}</option>)}</NativeSelect></label>
  <NumberField label={t('sheets.format.size')} unit="pt" value={style?.size??null} resetKey={`${s.address}:${s.revision??0}`} min={MIN_FONT_SIZE} max={MAX_FONT_SIZE} step={1} disabled={action.busy||!style} list="sheets-format-sizes" constraintError={t('sheets.format.sizeInvalid')} parse={v=>{const n=Number(v.trim().replace(',','.'));return v.trim()&&Number.isFinite(n)?{ok:true,value:n}:{ok:false,error:t('sheets.format.sizeInvalid')};}} onCommit={size=>send({kind:'fontSize',size})}/>
  <datalist id="sheets-format-sizes">{FONT_SIZES.map(n=><option key={n} value={n}/>)}</datalist>
  <div className="flex flex-col gap-1"><span>{t('sheets.format.textColor')}</span><div className="flex items-center gap-1"><span className="h-7 w-8 shrink-0 overflow-hidden rounded-sm border border-subtle"><NativeInput type="color" className="size-full cursor-pointer border-0 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0" aria-label={t('sheets.format.textColor')} value={textColor} onChange={e=>setTextColor(e.currentTarget.value.toUpperCase())}/></span><Button variant="outline" size="compact" disabled={action.busy} onClick={()=>send({kind:'fontColor',color:textColor})}>{t('sheets.format.apply')}</Button><Button variant="outline" size="compact" disabled={action.busy} onClick={()=>send({kind:'fontColor',color:'auto'})}>{t('sheets.format.auto')}</Button></div></div>
  <div className="flex flex-col gap-1"><span>{t('sheets.format.fillColor')}</span><div className="flex items-center gap-1"><span className="h-7 w-8 shrink-0 overflow-hidden rounded-sm border border-subtle"><NativeInput type="color" className="size-full cursor-pointer border-0 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0" aria-label={t('sheets.format.fillColor')} value={fillColor} onChange={e=>setFillColor(e.currentTarget.value.toUpperCase())}/></span><Button variant="outline" size="compact" disabled={action.busy} onClick={()=>send({kind:'fillColor',color:fillColor})}>{t('sheets.format.apply')}</Button><Button variant="outline" size="compact" disabled={action.busy} onClick={()=>send({kind:'fillColor',color:'none'})}>{t('sheets.format.noFill')}</Button></div></div>
  <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.format.number')}>
   <label className="flex flex-col gap-1">{t('sheets.format.number')}<NativeSelect className={field} value={num.preset} disabled={action.busy||!style} onChange={e=>send({kind:'numFmt',preset:e.currentTarget.value,...(DECIMAL_PRESETS.includes(e.currentTarget.value as never)?{decimals:num.preset==='custom'||!DECIMAL_PRESETS.includes(num.preset)?(e.currentTarget.value==='percent'?0:2):num.decimals}:{}),...(e.currentTarget.value==='currency'?{symbol:num.symbol}:{})})} data-testid="sheets-format-number">{num.preset==='custom'&&<option value="custom" disabled>{t('sheets.format.num.custom')}</option>}{NUM_PRESETS.map(p=><option key={p} value={p}>{t('sheets.format.num.'+p)}</option>)}</NativeSelect></label>
   {num.preset==='currency'&&<label className="flex flex-col gap-1">{t('sheets.format.symbol')}<NativeSelect className={field} value={num.symbol} disabled={action.busy} onChange={e=>send({kind:'numFmt',preset:'currency',decimals:num.decimals,symbol:e.currentTarget.value})}>{CURRENCY_SYMBOLS.map(c=><option key={c} value={c}>{c}</option>)}</NativeSelect></label>}
   {DECIMAL_PRESETS.includes(num.preset as never)&&<NumberField label={t('sheets.format.decimals')} value={num.decimals} resetKey={`${s.address}:${s.revision??0}`} min={0} max={MAX_DECIMALS} step={1} disabled={action.busy} constraintError={t('sheets.format.decimalsInvalid')} parse={v=>{const n=Number(v.trim());return v.trim()&&Number.isInteger(n)?{ok:true,value:n}:{ok:false,error:t('sheets.format.decimalsInvalid')};}} onCommit={decimals=>send({kind:'numFmt',preset:num.preset,decimals,...(num.preset==='currency'?{symbol:num.symbol}:{})})}/>}
   <div className="flex flex-wrap gap-1"><Button variant="outline" size="compact" disabled={action.busy||!style} aria-label={t('sheets.format.moreDecimals')} onClick={()=>send({kind:'decimals',delta:1})} data-testid="sheets-format-more-decimals">.0 +</Button><Button variant="outline" size="compact" disabled={action.busy||!style} aria-label={t('sheets.format.fewerDecimals')} onClick={()=>send({kind:'decimals',delta:-1})} data-testid="sheets-format-fewer-decimals">.0 −</Button><Button variant="outline" size="compact" disabled={action.busy||!style} aria-label={t('sheets.format.num.percent')} onClick={()=>send({kind:'numFmt',preset:'percent',decimals:0})}>%</Button></div>
  </div>
  <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.format.align')}>
   <span>{t('sheets.format.align')}</span>
   <div className="flex flex-wrap gap-1">{H_ALIGNS.map(a=><Button key={a} variant="outline" size="compact" aria-pressed={style?.h===a} disabled={action.busy||!style} onClick={()=>send({kind:'hAlign',align:a})} data-testid={'sheets-format-h-'+a}>{t('sheets.format.align'+a[0].toUpperCase()+a.slice(1))}</Button>)}</div>
   <div className="flex flex-wrap gap-1">{V_ALIGNS.map(a=><Button key={a} variant="outline" size="compact" aria-pressed={(style?.v??'bottom')===a} disabled={action.busy||!style} onClick={()=>send({kind:'vAlign',align:a})} data-testid={'sheets-format-v-'+a}>{t('sheets.format.align'+a[0].toUpperCase()+a.slice(1))}</Button>)}</div>
   <div className="flex flex-wrap gap-1"><Button variant="outline" size="compact" aria-pressed={!!style?.wrap} disabled={action.busy||!style} onClick={()=>send({kind:'wrap',on:!style?.wrap})} data-testid="sheets-format-wrap">{t('sheets.format.wrap')}</Button><Button variant="outline" size="compact" disabled={action.busy||!style||(style.indent??0)<=0} aria-label={t('sheets.format.indentLess')} onClick={()=>send({kind:'indent',delta:-1})} data-testid="sheets-format-indent-less">⇤</Button><Button variant="outline" size="compact" disabled={action.busy||!style||(style.indent??0)>=250} aria-label={t('sheets.format.indentMore')} onClick={()=>send({kind:'indent',delta:1})} data-testid="sheets-format-indent-more">⇥</Button></div>
  </div>
  <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.format.borders')}>
   <span>{t('sheets.format.borders')}</span>
   <label className="flex flex-col gap-1">{t('sheets.format.borderStyle')}<NativeSelect className={field} value={border.style} disabled={action.busy||!style} onChange={e=>setBorder({...border,style:e.currentTarget.value as BorderLineStyle})} data-testid="sheets-format-border-style">{BORDER_STYLES.map(b=><option key={b} value={b}>{t('sheets.format.borderStyle.'+b)}</option>)}</NativeSelect></label>
   <div className="flex items-center gap-1"><span className="h-7 w-8 shrink-0 overflow-hidden rounded-sm border border-subtle"><NativeInput type="color" className="size-full cursor-pointer border-0 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0" aria-label={t('sheets.format.borderColor')} value={border.color} onChange={e=>setBorder({...border,color:e.currentTarget.value.toUpperCase()})}/></span><span>{t('sheets.format.borderColor')}</span></div>
   <div className="flex flex-wrap gap-1">{BORDER_PRESETS.map(b=><Button key={b} variant="outline" size="compact" disabled={action.busy||!style} onClick={()=>send({kind:'borders',preset:b,...(b==='none'?{}:{style:border.style,color:border.color})})} data-testid={'sheets-format-border-'+b}>{t('sheets.format.border.'+b)}</Button>)}</div>
  </div>
  <p role="status">{action.notice}</p></Region>;
}
export function SheetsFormatSection({sectionId,context}:InspectorSectionProps){return <SheetsFormatPanel panelId={sectionId} context={context}/>;}

/** Column width, row height, autofit, hide/show and freeze panes for the rows and columns spanned by the selection. Each control dispatches `sheets.resize` or `sheets.freeze`: one operation, one undo step. */
export function SheetsLayoutPanel({context}:PanelHostProps){
 const {t}=useT(),s=usePanelWorkbook(context);const action=useAction();
 if(!s)return <Region><p>{t('sheets.panel.none')}</p></Region>;
 const r=s.range,col=r?r.c0:0,row=r?r.r0:0;const layout=s.layout;
 const resize=(axis:'rows'|'cols',kind:string,px?:number)=>void action.run('sheets.resize',{axis,kind,...(px===undefined?{}:{px})});
 const freeze=(rows:number,cols:number)=>void action.run('sheets.freeze',{rows,cols});
 const sizeField=(label:string,axis:'rows'|'cols',value:number|null,max:number)=><NumberField label={label} unit="px" value={value} resetKey={`${axis}:${s.address}:${s.revision??0}`} min={0} max={max} step={1} disabled={action.busy||!layout} constraintError={t('sheets.layout.sizeInvalid')} parse={v=>{const n=Number(v.trim().replace(',','.'));return v.trim()&&Number.isFinite(n)&&n>=0&&n<=max?{ok:true,value:n}:{ok:false,error:t('sheets.layout.sizeInvalid')};}} onCommit={px=>resize(axis,'size',px)}/>;
 const btn=(key:string,onClick:()=>void,id:string,off=false)=><Button variant="outline" size="compact" disabled={action.busy||!layout||off} onClick={onClick} data-testid={id}>{t(key)}</Button>;
 const edit=(axis:'rows'|'cols',kind:string)=>void action.run('sheets.editLines',{axis,kind});
 const frozen=layout?.freeze;
 return <Region>
  {sizeField(t('sheets.layout.colWidth'),'cols',colWidthPx(layout,col),MAX_COL_PX)}
  <div className="flex flex-wrap gap-1">{btn('sheets.layout.autofitCols',()=>resize('cols','autofit'),'sheets-layout-autofit-cols')}{btn('sheets.layout.hideCols',()=>resize('cols','hide'),'sheets-layout-hide-cols')}{btn('sheets.layout.showCols',()=>resize('cols','unhide'),'sheets-layout-show-cols')}</div>
  {sizeField(t('sheets.layout.rowHeight'),'rows',rowHeightPx(layout,row),MAX_ROW_PX)}
  <div className="flex flex-wrap gap-1">{btn('sheets.layout.autofitRows',()=>resize('rows','autofit'),'sheets-layout-autofit-rows')}{btn('sheets.layout.hideRows',()=>resize('rows','hide'),'sheets-layout-hide-rows')}{btn('sheets.layout.showRows',()=>resize('rows','unhide'),'sheets-layout-show-rows')}</div>
  <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.layout.insertDelete')}>
   <span>{t('sheets.layout.insertDelete')}</span>
   <div className="flex flex-wrap gap-1">{btn('sheets.layout.insertAbove',()=>edit('rows','insertBefore'),'sheets-layout-insert-above')}{btn('sheets.layout.insertBelow',()=>edit('rows','insertAfter'),'sheets-layout-insert-below')}{btn('sheets.layout.deleteRows',()=>edit('rows','delete'),'sheets-layout-delete-rows')}</div>
   <div className="flex flex-wrap gap-1">{btn('sheets.layout.insertLeft',()=>edit('cols','insertBefore'),'sheets-layout-insert-left')}{btn('sheets.layout.insertRight',()=>edit('cols','insertAfter'),'sheets-layout-insert-right')}{btn('sheets.layout.deleteCols',()=>edit('cols','delete'),'sheets-layout-delete-cols')}</div>
  </div>
  <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.layout.freeze')}>
   <span>{t('sheets.layout.freeze')}</span>
   <span className="text-ink-3">{frozen?t('sheets.layout.frozen',{rows:frozen.rows,cols:frozen.cols}):t('sheets.layout.notFrozen')}</span>
   <div className="flex flex-wrap gap-1">{btn('sheets.layout.freezeTop',()=>freeze(1,0),'sheets-layout-freeze-top')}{btn('sheets.layout.freezeFirstCol',()=>freeze(0,1),'sheets-layout-freeze-col')}{btn('sheets.layout.freezeAtCell',()=>freeze(row,col),'sheets-layout-freeze-cell',row===0&&col===0||row>MAX_FREEZE||col>MAX_FREEZE)}{btn('sheets.layout.unfreeze',()=>freeze(0,0),'sheets-layout-unfreeze',!frozen)}</div>
  </div>
  <SortGroup/>
  <FilterGroup/>
  <FillGroup/>
  <p role="status">{action.notice}</p></Region>;
}
/** Sorts the rows of exactly the selected block by one column. The block is never widened and the header row is an explicit choice. One undo step. */
function SortGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [column,setColumn]=useState(0);const [order,setOrder]=useState<'asc'|'desc'>('asc');const [header,setHeader]=useState(false);
 const r=s?.range;if(!s||!r)return null;
 const rows=r.r1-r.r0+1,cols=r.c1-r.c0+1,problem=sortBlockProblem(rows,cols,header),col=Math.min(column,cols-1);
 const options=Array.from({length:Math.min(cols,MAX_SORT_OPTIONS)},(_,i)=>i);
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.sort.title')}>
  <span>{t('sheets.sort.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.sort.column')}<NativeSelect className={field} value={col} disabled={action.busy} onChange={e=>setColumn(Number(e.currentTarget.value))} data-testid="sheets-sort-column">{options.map(i=><option key={i} value={i}>{colName(r.c0+i)}</option>)}</NativeSelect></label>
  <label className="flex flex-col gap-1">{t('sheets.sort.order')}<NativeSelect className={field} value={order} disabled={action.busy} onChange={e=>setOrder(e.currentTarget.value==='desc'?'desc':'asc')} data-testid="sheets-sort-order"><option value="asc">{t('sheets.sort.asc')}</option><option value="desc">{t('sheets.sort.desc')}</option></NativeSelect></label>
  <label className="flex flex-col gap-1">{t('sheets.sort.header')}<NativeSelect className={field} value={header?'yes':'no'} disabled={action.busy} onChange={e=>setHeader(e.currentTarget.value==='yes')} data-testid="sheets-sort-header"><option value="no">{t('sheets.sort.headerNo')}</option><option value="yes">{t('sheets.sort.headerYes')}</option></NativeSelect></label>
  <Button variant="outline" size="compact" disabled={action.busy||!!problem} onClick={()=>void action.run('sheets.sort',{column:col,order,header})} data-testid="sheets-sort-apply">{t('sheets.sort.apply')}</Button>
  <p className="text-ink-3">{t(problem?'sheets.sort.need':'sheets.sort.scope',{range:rangeAddress(r)})}</p>
 </div>;
}
const FILTER_LABELS:Record<FilterCondition,string>={'=':'=','<>':'\u2260','>':'>','<':'<','>=':'\u2265','<=':'\u2264',beginsWith:'',endsWith:'',contains:'',notContains:''};
/** Filters rows by one column. The selection only creates the filter (first row is the header); an existing filter keeps its own range. Hidden rows follow the file and undo. */
function FilterGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [column,setColumn]=useState(0);const [cond,setCond]=useState<FilterCondition>('contains');const [value,setValue]=useState('');
 const r=s?.range;if(!s||!r)return null;
 const rows=r.r1-r.r0+1,cols=r.c1-r.c0+1,col=Math.min(column,cols-1),problem=filterValueProblem(value),block=sortBlockProblem(rows,cols,true),options=Array.from({length:Math.min(cols,MAX_SORT_OPTIONS)},(_,i)=>i);
 const label=(c:FilterCondition)=>FILTER_LABELS[c]||t('sheets.filter.op.'+c);
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.filter.title')}>
  <span>{t('sheets.filter.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.filter.column')}<NativeSelect className={field} value={col} disabled={action.busy} onChange={e=>setColumn(Number(e.currentTarget.value))} data-testid="sheets-filter-column">{options.map(i=><option key={i} value={i}>{colName(r.c0+i)}</option>)}</NativeSelect></label>
  <label className="flex flex-col gap-1">{t('sheets.filter.condition')}<NativeSelect className={field} value={cond} disabled={action.busy} onChange={e=>setCond(e.currentTarget.value as FilterCondition)} data-testid="sheets-filter-condition">{FILTER_CONDITIONS.map(c=><option key={c} value={c}>{label(c)}</option>)}</NativeSelect></label>
  <label className="flex flex-col gap-1">{t('sheets.filter.value')}<NativeInput className={field} value={value} maxLength={MAX_FILTER_VALUE} aria-invalid={!!value&&!!problem} onChange={e=>setValue(e.currentTarget.value)} data-testid="sheets-filter-value"/></label>
  <Button variant="outline" size="compact" disabled={action.busy||!!problem||!!block} onClick={()=>void action.run('sheets.filter',{kind:'custom',column:r.c0+col,op:cond,value})} data-testid="sheets-filter-apply">{t('sheets.filter.apply')}</Button>
  <div className="flex flex-wrap gap-1">
   <Button variant="outline" size="compact" disabled={action.busy} onClick={()=>void action.run('sheets.filter',{kind:'clear',column:r.c0+col})} data-testid="sheets-filter-clear">{t('sheets.filter.clear')}</Button>
   <Button variant="outline" size="compact" disabled={action.busy} onClick={()=>void action.run('sheets.filter',{kind:'clearAll'})} data-testid="sheets-filter-clear-all">{t('sheets.filter.clearAll')}</Button>
   <Button variant="outline" size="compact" disabled={action.busy} onClick={()=>void action.run('sheets.filter',{kind:'off'})} data-testid="sheets-filter-off">{t('sheets.filter.off')}</Button>
  </div>
  <p className="text-ink-3">{t(block?'sheets.sort.need':'sheets.filter.scope',{range:rangeAddress(r)})}</p>
 </div>;
}
/** Fills the selected block from its first row or column. One undo step; the block is never widened. */
function FillGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();
 const r=s?.range;if(!s||!r)return null;
 const rows=r.r1-r.r0+1,cols=r.c1-r.c0+1;
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.fill.title')}>
  <span>{t('sheets.fill.title')}</span>
  <div className="flex flex-wrap gap-2">
   {FILL_DIRECTIONS.map((d:FillDirection)=><Button key={d} variant="outline" size="compact" disabled={action.busy||!!fillBlockProblem(r.r0,r.c0,rows,cols,d)} onClick={()=>void action.run('sheets.fill',{dir:d})} data-testid={'sheets-fill-'+d}>{t('sheets.fill.'+d)}</Button>)}
  </div>
  <p className="text-ink-3">{t('sheets.fill.scope',{range:rangeAddress(r)})}</p>
 </div>;
}
export function SheetsLayoutSection({sectionId,context}:InspectorSectionProps){return <SheetsLayoutPanel panelId={sectionId} context={context}/>;}
