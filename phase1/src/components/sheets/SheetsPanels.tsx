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
import type {FillDirection,CfStyle} from '../../lib/sheets/protocol';
import {PIVOT_FUNCS,tableBlockProblem} from '../../lib/sheets/tableOps';
import type {PivotField,PivotFunc} from '../../lib/sheets/protocol';
import {nameProblem,nameTarget} from '../../lib/sheets/names';
import {internalTarget,linkTargetProblem,MAX_LINK_TEXT,MAX_NOTE_CHARS} from '../../lib/sheets/notes';
import {dedupeBlockProblem,splitBlockProblem,parseWidths,SPLIT_DELIMITERS} from '../../lib/sheets/dataTools';
import {replaceProblem,MAX_REPLACE_TEXT} from '../../lib/sheets/replaceOps';
import {getSheetsPanelController} from '../../lib/sheets/panelController';
import {VALIDATION_CHOICES,buildValidationOp,MAX_ITEM_CHARS,type ValidationChoice} from '../../lib/sheets/validationOps';
import type {CfOperator} from '../../lib/sheets/protocol';
import {CF_CHOICES,CF_STYLES,buildCfOp,cfChoiceNeeds,MAX_CF_TEXT,type CfChoice} from '../../lib/sheets/cfOps';
import {FILTER_CONDITIONS,MAX_FILTER_VALUE,filterValueProblem} from '../../lib/sheets/filterOps';
import {MAX_SHEETS,sheetNameProblem} from '../../lib/sheets/sheetOps';
import type {BorderLineStyle,FilterCondition,RangeCell} from '../../lib/sheets/protocol';
import {colWidthPx,rowHeightPx,MAX_COL_PX,MAX_ROW_PX,MAX_FREEZE} from '../../lib/sheets/lineOps';
import {BORDER_PRESETS,BORDER_STYLES,DEFAULT_BORDER_COLOR,H_ALIGNS,V_ALIGNS,CURRENCY_SYMBOLS,DECIMAL_PRESETS,MAX_DECIMALS,NUM_PRESETS,detectNumFmt,DEFAULT_FILL_COLOR,DEFAULT_TEXT_COLOR,FONT_NAMES,FONT_SIZES,MAX_FONT_SIZE,MIN_FONT_SIZE,isHexColor,toggleOp,type ToggleKind,affixProblem,customNumFmtCode,DATE_PATTERNS,MAX_AFFIX,NEGATIVE_STYLES,ZERO_STYLES} from '../../lib/sheets/formatOps';
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
  <HighlightGroup/>
  <ValidationGroup/>
  <ReplaceGroup/>
  <DedupeGroup/>
  <NotesGroup/>
  <NamesGroup/>
  <TablesGroup/>
  <PivotGroup/>
  <CustomFormatGroup/>
  <SplitGroup/>
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
/** Tables in one grouped menu: make a table from the selection, or change one of this sheet's tables. One undo step each. */
type TableAction='create'|'totalsOn'|'totalsOff'|'bandedOn'|'bandedOff'|'style'|'rename'|'convert';
function TablesGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [act,setAct]=useState<TableAction>('create');const [pick,setPick]=useState('');const [name,setName]=useState('');const [style,setStyle]=useState('TableStyleMedium2');
 const r=s?.range;if(!s||!r)return null;
 const list=s.tables?.tables??[],styles=s.tables?.styles??[],chosen=list.find(x=>x.name===pick)??list[0]??null,creating=act==='create',naming=creating||act==='rename';
 const block=tableBlockProblem(r.r1-r.r0+1,r.c1-r.c0+1),nameBad=name.trim()!==''&&!!nameProblem(name.trim());
 const problem=creating?(block||nameBad?'x':null):(!chosen||(act==='rename'&&(name.trim()===''||nameBad))?'x':null);
 const apply=()=>{
  if(creating)void action.run('sheets.table',{kind:'create',...(name.trim()?{name:name.trim()}:{}),style}).then(x=>{if(x!==null)setName('');});
  else if(chosen&&act==='style')void action.run('sheets.table',{kind:'style',table:chosen.name,style});
  else if(chosen&&act==='rename')void action.run('sheets.table',{kind:'rename',table:chosen.name,newName:name.trim()}).then(x=>{if(x!==null){setName('');setPick(name.trim());}});
  else if(chosen&&act==='convert')void action.run('sheets.table',{kind:'convert',table:chosen.name});
  else if(chosen)void action.run('sheets.table',{kind:act.startsWith('totals')?'totals':'banded',table:chosen.name,on:act.endsWith('On')});
 };
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.tb.title')}>
  <span>{t('sheets.tb.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.tb.existing')}<NativeSelect className={field} value={chosen?.name??''} disabled={action.busy||list.length===0} onChange={e=>setPick(e.currentTarget.value)} data-testid="sheets-tb-pick">{list.length===0&&<option value="">{t('sheets.tb.none')}</option>}{list.map(x=><option key={x.name} value={x.name}>{x.name} {x.range}</option>)}</NativeSelect></label>
  <label className="flex flex-col gap-1">{t('sheets.nm.action')}<NativeSelect className={field} value={act} disabled={action.busy} onChange={e=>setAct(e.currentTarget.value as TableAction)} data-testid="sheets-tb-action">
   <optgroup label={t('sheets.nm.groupSelection')}><option value="create">{t('sheets.tb.create')}</option></optgroup>
   <optgroup label={t('sheets.tb.groupTable')}><option value="totalsOn">{t('sheets.tb.totalsOn')}</option><option value="totalsOff">{t('sheets.tb.totalsOff')}</option><option value="bandedOn">{t('sheets.tb.bandedOn')}</option><option value="bandedOff">{t('sheets.tb.bandedOff')}</option><option value="style">{t('sheets.tb.style')}</option><option value="rename">{t('sheets.tb.rename')}</option><option value="convert">{t('sheets.tb.convert')}</option></optgroup>
  </NativeSelect></label>
  {(creating||act==='style')&&<label className="flex flex-col gap-1">{t('sheets.tb.styleName')}<NativeSelect className={field} value={style} disabled={action.busy} onChange={e=>setStyle(e.currentTarget.value)} data-testid="sheets-tb-style">{(styles.length?styles:[style]).map(x=><option key={x} value={x}>{x.replace('TableStyle','')}</option>)}</NativeSelect></label>}
  {naming&&<label className="flex flex-col gap-1">{creating?t('sheets.tb.nameOptional'):t('sheets.tb.newName')}<NativeInput className={field} value={name} maxLength={64} aria-invalid={nameBad} disabled={action.busy} onChange={e=>setName(e.currentTarget.value)} data-testid="sheets-tb-name"/></label>}
  <Button variant="outline" size="compact" disabled={action.busy||!!problem} onClick={apply} data-testid="sheets-tb-apply">{t('sheets.nm.apply')}</Button>
  <p className="text-ink-3">{t(creating?'sheets.tb.scope':'sheets.tb.scopeTable',{range:rangeAddress(r)})}</p>
 </div>;
}
/** A small PivotTable from the selection (first row = column names) on a new sheet, or a refresh of all PivotTables. One undo step. */
type PivotAction='create'|'refresh';
function PivotGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [act,setAct]=useState<PivotAction>('create');const [fields,setFields]=useState<PivotField[]>([]);const [rows,setRows]=useState('');const [cols,setCols]=useState('');const [vals,setVals]=useState('');const [func,setFunc]=useState<PivotFunc>('sum');
 const r=s?.range;const key=r?`${s?.file}|${s?.sheet}|${r.r0}|${r.c0}|${r.r1}|${r.c1}|${s?.revision}`:'';const blockOk=!!r&&!tableBlockProblem(r.r1-r.r0+1,r.c1-r.c0+1);
 useEffect(()=>{let live=true;const c=getSheetsPanelController();if(!blockOk||!c){setFields([]);return;}void Promise.resolve(c.pivotFields()).then(f=>{if(live)setFields(f);},()=>{if(live)setFields([]);});return()=>{live=false;};},[key,blockOk]);
 if(!s||!r)return null;
 const has=(n:string)=>fields.some(f=>f.name===n),numeric=(n:string)=>fields.find(f=>f.name===n)?.numeric===true;
 const create=act==='create',problem=create?(!has(rows)||!has(vals)||(cols!==''&&(!has(cols)||cols===rows))||(func!=='count'&&!numeric(vals))):null;
 const choose=(value:string,set:(v:string)=>void,id:string,label:string,blank?:boolean)=><label className="flex flex-col gap-1">{label}<NativeSelect className={field} value={has(value)?value:''} disabled={action.busy} onChange={e=>set(e.currentTarget.value)} data-testid={id}><option value="">{blank?t('sheets.pv.noColumns'):t('sheets.nm.none')}</option>{fields.map(f=><option key={f.name} value={f.name}>{f.name}</option>)}</NativeSelect></label>;
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.pv.title')}>
  <span>{t('sheets.pv.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.nm.action')}<NativeSelect className={field} value={act} disabled={action.busy} onChange={e=>setAct(e.currentTarget.value as PivotAction)} data-testid="sheets-pv-action"><option value="create">{t('sheets.pv.create')}</option><option value="refresh">{t('sheets.pv.refresh')}</option></NativeSelect></label>
  {create&&<>
   {choose(rows,setRows,'sheets-pv-rows',t('sheets.pv.rows'))}
   {choose(cols,setCols,'sheets-pv-cols',t('sheets.pv.cols'),true)}
   {choose(vals,setVals,'sheets-pv-values',t('sheets.pv.values'))}
   <label className="flex flex-col gap-1">{t('sheets.pv.func')}<NativeSelect className={field} value={func} disabled={action.busy} onChange={e=>setFunc(e.currentTarget.value as PivotFunc)} data-testid="sheets-pv-func">{PIVOT_FUNCS.map(f=><option key={f} value={f}>{t('sheets.pv.f.'+f)}</option>)}</NativeSelect></label>
  </>}
  <Button variant="outline" size="compact" disabled={action.busy||!!problem} onClick={()=>void action.run('sheets.pivot',create?{kind:'create',rows,values:vals,func,...(cols?{columns:cols}:{})}:{kind:'refresh'})} data-testid="sheets-pv-apply">{t('sheets.nm.apply')}</Button>
  <p className="text-ink-3">{t(create?(blockOk?'sheets.pv.scope':'sheets.pv.need'):'sheets.pv.scopeRefresh',{range:rangeAddress(r)})}</p>
 </div>;
}
/** Named ranges in one grouped menu: define the selection, redefine, go to or delete a name. One undo step each. */
type NameAction='define'|'defineSheet'|'replace'|'replaceSheet'|'go'|'delete';
function NamesGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [act,setAct]=useState<NameAction>('define');const [pick,setPick]=useState('');const [name,setName]=useState('');
 if(!s)return null;
 const list=s.names??[],chosen=list.find(n=>n.scope+'|'+n.name===pick)??null,defining=act==='define'||act==='defineSheet'||act==='replace'||act==='replaceSheet';
 const own=chosen&&(chosen.scope==='Workbook'||chosen.scope===s.sheetName),target=chosen?nameTarget(chosen.refersTo):null,dest=target?(s.workbook?.sheets??[]).find(x=>x.name.toLowerCase()===target.sheet.toLowerCase()&&x.visibility==='Visible'):undefined;
 const problem=defining?(nameProblem(name.trim())):act==='go'?(target&&dest?null:'target'):(chosen&&own?null:'pick');
 const apply=()=>{
  if(defining)void action.run('sheets.names',{kind:'define',name:name.trim(),scope:act==='defineSheet'||act==='replaceSheet'?'sheet':'workbook',replace:act==='replace'||act==='replaceSheet'}).then(r=>{if(r!==null)setName('');});
  else if(act==='go'&&target&&dest)void action.run('sheets.navigate',{sheet:dest.index,address:target.address});
  else if(chosen)void action.run('sheets.names',{kind:'delete',name:chosen.name,scope:chosen.scope==='Workbook'?'workbook':'sheet'});
 };
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.nm.title')}>
  <span>{t('sheets.nm.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.nm.existing')}<NativeSelect className={field} value={pick} disabled={action.busy} onChange={e=>setPick(e.currentTarget.value)} data-testid="sheets-nm-pick"><option value="">{t('sheets.nm.none')}</option>{list.map(n=><option key={n.scope+'|'+n.name} value={n.scope+'|'+n.name}>{n.name} ({n.scope}) {n.refersTo}</option>)}</NativeSelect></label>
  <label className="flex flex-col gap-1">{t('sheets.nm.action')}<NativeSelect className={field} value={act} disabled={action.busy} onChange={e=>setAct(e.currentTarget.value as NameAction)} data-testid="sheets-nm-action">
   <optgroup label={t('sheets.nm.groupSelection')}><option value="define">{t('sheets.nm.define')}</option><option value="defineSheet">{t('sheets.nm.defineSheet')}</option><option value="replace">{t('sheets.nm.replace')}</option><option value="replaceSheet">{t('sheets.nm.replaceSheet')}</option></optgroup>
   <optgroup label={t('sheets.nm.groupName')}><option value="go">{t('sheets.nm.go')}</option><option value="delete">{t('sheets.nm.delete')}</option></optgroup>
  </NativeSelect></label>
  {defining&&<label className="flex flex-col gap-1">{t('sheets.nm.name')}<NativeInput className={field} value={name} maxLength={64} aria-invalid={name.trim()!==''&&!!problem} disabled={action.busy} onChange={e=>setName(e.currentTarget.value)} data-testid="sheets-nm-name"/></label>}
  <Button variant="outline" size="compact" disabled={action.busy||!!problem} onClick={apply} data-testid="sheets-nm-apply">{t('sheets.nm.apply')}</Button>
  <p className="text-ink-3">{t(defining&&s.range?'sheets.nm.scope':'sheets.nm.scopeName',{range:s.range?rangeAddress(s.range):s.address})}</p>
 </div>;
}
/** Custom number and date formats in one grouped menu. Built from fields, never from free text; one undo step. */
function CustomFormatGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();
 const [kind,setKind]=useState('number');const [decimals,setDecimals]=useState(2);const [grouping,setGrouping]=useState(true);const [percent,setPercent]=useState(false);const [prefix,setPrefix]=useState('');const [suffix,setSuffix]=useState('');const [neg,setNeg]=useState<(typeof NEGATIVE_STYLES)[number]>('minus');const [zero,setZero]=useState<(typeof ZERO_STYLES)[number]>('show');
 if(!s||!s.range)return null;
 const isNumber=kind==='number',bad=isNumber&&(affixProblem(prefix)||affixProblem(suffix));
 const spec={grouping,percent,decimals,...(prefix?{prefix}:{}),...(suffix?{suffix}:{}),negative:neg,zero};
 const op=isNumber?{kind:'numFmtCustom',...spec}:{kind:'dateFmt',pattern:kind};
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.cf2.title')}>
  <span>{t('sheets.cf2.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.cf2.kind')}<NativeSelect className={field} value={kind} disabled={action.busy} onChange={e=>setKind(e.currentTarget.value)} data-testid="sheets-cf2-kind">
   <optgroup label={t('sheets.cf2.groupNumber')}><option value="number">{t('sheets.cf2.number')}</option></optgroup>
   <optgroup label={t('sheets.cf2.groupDate')}>{DATE_PATTERNS.map(p=><option key={p.id} value={p.id}>{p.code}</option>)}</optgroup>
  </NativeSelect></label>
  {isNumber&&<>
   <label className="flex flex-col gap-1">{t('sheets.format.decimals')}<NativeSelect className={field} value={decimals} disabled={action.busy} onChange={e=>setDecimals(Number(e.currentTarget.value))} data-testid="sheets-cf2-decimals">{Array.from({length:MAX_DECIMALS+1},(_,i)=><option key={i} value={i}>{i}</option>)}</NativeSelect></label>
   <label className="flex flex-col gap-1">{t('sheets.cf2.grouping')}<NativeSelect className={field} value={grouping?'yes':'no'} disabled={action.busy} onChange={e=>setGrouping(e.currentTarget.value==='yes')} data-testid="sheets-cf2-grouping"><option value="yes">{t('sheets.rp.yes')}</option><option value="no">{t('sheets.rp.no')}</option></NativeSelect></label>
   <label className="flex flex-col gap-1">{t('sheets.cf2.percent')}<NativeSelect className={field} value={percent?'yes':'no'} disabled={action.busy} onChange={e=>setPercent(e.currentTarget.value==='yes')} data-testid="sheets-cf2-percent"><option value="no">{t('sheets.rp.no')}</option><option value="yes">{t('sheets.rp.yes')}</option></NativeSelect></label>
   <label className="flex flex-col gap-1">{t('sheets.cf2.prefix')}<NativeInput className={field} value={prefix} maxLength={MAX_AFFIX} aria-invalid={affixProblem(prefix)} disabled={action.busy} onChange={e=>setPrefix(e.currentTarget.value)} data-testid="sheets-cf2-prefix"/></label>
   <label className="flex flex-col gap-1">{t('sheets.cf2.suffix')}<NativeInput className={field} value={suffix} maxLength={MAX_AFFIX} aria-invalid={affixProblem(suffix)} disabled={action.busy} onChange={e=>setSuffix(e.currentTarget.value)} data-testid="sheets-cf2-suffix"/></label>
   <label className="flex flex-col gap-1">{t('sheets.cf2.negative')}<NativeSelect className={field} value={neg} disabled={action.busy} onChange={e=>setNeg(e.currentTarget.value as typeof neg)} data-testid="sheets-cf2-negative">{NEGATIVE_STYLES.map(n=><option key={n} value={n}>{t('sheets.cf2.neg.'+n)}</option>)}</NativeSelect></label>
   <label className="flex flex-col gap-1">{t('sheets.cf2.zero')}<NativeSelect className={field} value={zero} disabled={action.busy} onChange={e=>setZero(e.currentTarget.value as typeof zero)} data-testid="sheets-cf2-zero">{ZERO_STYLES.map(z=><option key={z} value={z}>{t('sheets.cf2.zero.'+z)}</option>)}</NativeSelect></label>
   <p className="text-ink-3" data-testid="sheets-cf2-code">{bad?t('sheets.cf2.badAffix'):customNumFmtCode(spec)}</p>
  </>}
  <Button variant="outline" size="compact" disabled={action.busy||bad} onClick={()=>void action.run('sheets.format',op)} data-testid="sheets-cf2-apply">{t('sheets.cf2.apply')}</Button>
  <p className="text-ink-3">{t('sheets.cf2.scope',{range:rangeAddress(s.range)})}</p>
 </div>;
}
/** Notes, threaded comments and links on the active cell. One undo step each; links are shown and followed inside the workbook only. */
function NotesGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [text,setText]=useState('');const [target,setTarget]=useState('');const [label,setLabel]=useState('');
 if(!s)return null;
 const a=s.annotations??null,note=a?.note??null,link=a?.link??null,problem=target.trim()===''?'empty':linkTargetProblem(target.trim()),here=internalTarget(link?.target??''),sheets=s.workbook?.sheets??[];
 const place=here?sheets.find(x=>x.name.toLowerCase()===here.sheet.toLowerCase()&&x.visibility==='Visible'):undefined;
 const run=(o:object,clear?:()=>void)=>void action.run('sheets.annotate',o).then(r=>{if(r!==null)clear?.();});
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.nt.title')}>
  <span>{t('sheets.nt.title')} ({s.address})</span>
  {note?<div className="flex flex-col gap-1" data-testid="sheets-nt-thread">
   <p>{note.author?note.author+': ':''}{note.text}</p>
   {note.replies.map(([who,body],i)=><p key={i} className="text-ink-3">{who?who+': ':''}{body}</p>)}
   {note.resolved&&<p className="text-ink-3">{t('sheets.nt.resolved')}</p>}
  </div>:<p className="text-ink-3">{t('sheets.nt.none')}</p>}
  <label className="flex flex-col gap-1">{t('sheets.nt.text')}<NativeInput className={field} value={text} maxLength={MAX_NOTE_CHARS} disabled={action.busy} onChange={e=>setText(e.currentTarget.value)} data-testid="sheets-nt-text"/></label>
  <div className="flex flex-wrap gap-2">
   {!note&&<Button variant="outline" size="compact" disabled={action.busy||text.trim()===''} onClick={()=>run({kind:'note',text},()=>setText(''))} data-testid="sheets-nt-note">{t('sheets.nt.addNote')}</Button>}
   {!note&&<Button variant="outline" size="compact" disabled={action.busy||text.trim()===''} onClick={()=>run({kind:'comment',text},()=>setText(''))} data-testid="sheets-nt-comment">{t('sheets.nt.addComment')}</Button>}
   {note&&<Button variant="outline" size="compact" disabled={action.busy||text.trim()===''} onClick={()=>run({kind:'reply',text},()=>setText(''))} data-testid="sheets-nt-reply">{t('sheets.nt.reply')}</Button>}
   {note&&<Button variant="outline" size="compact" disabled={action.busy} onClick={()=>run({kind:'resolve',resolved:!note.resolved})} data-testid="sheets-nt-resolve">{t(note.resolved?'sheets.nt.reopen':'sheets.nt.resolve')}</Button>}
   {note&&<Button variant="outline" size="compact" disabled={action.busy} onClick={()=>run({kind:'remove'})} data-testid="sheets-nt-remove">{t('sheets.nt.remove')}</Button>}
  </div>
  {link&&<p data-testid="sheets-nt-link">{link.target}</p>}
  {place&&here&&<Button variant="outline" size="compact" disabled={action.busy} onClick={()=>void action.run('sheets.navigate',{sheet:place.index,address:here.address})} data-testid="sheets-nt-go">{t('sheets.nt.go')}</Button>}
  <label className="flex flex-col gap-1">{t('sheets.nt.target')}<NativeInput className={field} value={target} maxLength={2048} aria-invalid={target.trim()!==''&&!!problem} disabled={action.busy} onChange={e=>setTarget(e.currentTarget.value)} data-testid="sheets-nt-target"/></label>
  <label className="flex flex-col gap-1">{t('sheets.nt.label')}<NativeInput className={field} value={label} maxLength={MAX_LINK_TEXT} disabled={action.busy} onChange={e=>setLabel(e.currentTarget.value)} data-testid="sheets-nt-label"/></label>
  <div className="flex flex-wrap gap-2">
   <Button variant="outline" size="compact" disabled={action.busy||!!problem} onClick={()=>run(label.trim()?{kind:'link',target:target.trim(),text:label.trim()}:{kind:'link',target:target.trim()},()=>{setTarget('');setLabel('');})} data-testid="sheets-nt-setlink">{t('sheets.nt.setLink')}</Button>
   {link&&<Button variant="outline" size="compact" disabled={action.busy} onClick={()=>run({kind:'unlink'})} data-testid="sheets-nt-unlink">{t('sheets.nt.unlink')}</Button>}
  </div>
  <p className="text-ink-3">{t('sheets.nt.scope',{cell:s.address})}</p>
 </div>;
}
/** Removes rows that repeat an earlier row inside exactly the selected block. One undo step. */
function DedupeGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [header,setHeader]=useState(false);const [by,setBy]=useState(-1);
 const r=s?.range;if(!s||!r)return null;
 const rows=r.r1-r.r0+1,cols=r.c1-r.c0+1,problem=dedupeBlockProblem(rows,cols,header),pick=by>=0&&by<cols?by:-1,options=Array.from({length:Math.min(cols,MAX_SORT_OPTIONS)},(_,i)=>i);
 const columns=pick>=0?[pick]:Array.from({length:cols},(_,i)=>i);
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.dd.title')}>
  <span>{t('sheets.dd.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.dd.compare')}<NativeSelect className={field} value={pick} disabled={action.busy} onChange={e=>setBy(Number(e.currentTarget.value))} data-testid="sheets-dd-compare"><option value={-1}>{t('sheets.dd.all')}</option>{options.map(i=><option key={i} value={i}>{colName(r.c0+i)}</option>)}</NativeSelect></label>
  <label className="flex flex-col gap-1">{t('sheets.sort.header')}<NativeSelect className={field} value={header?'yes':'no'} disabled={action.busy} onChange={e=>setHeader(e.currentTarget.value==='yes')} data-testid="sheets-dd-header"><option value="no">{t('sheets.sort.headerNo')}</option><option value="yes">{t('sheets.sort.headerYes')}</option></NativeSelect></label>
  <Button variant="outline" size="compact" disabled={action.busy||!!problem} onClick={()=>void action.run('sheets.dedupe',{header,columns}).then(n=>{if(typeof n==='number')action.setNotice(t('sheets.dd.done',{n:String(n)}));})} data-testid="sheets-dd-apply">{t('sheets.dd.apply')}</Button>
  <p className="text-ink-3">{t(problem?'sheets.dd.need':'sheets.dd.scope',{range:rangeAddress(r)})}</p>
 </div>;
}
/** Splits the text of the selected column into the empty columns to its right. One undo step; nothing is overwritten. */
function SplitGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [delim,setDelim]=useState<string>(',');const [merge,setMerge]=useState(false);const [widths,setWidths]=useState('');
 const r=s?.range;if(!s||!r)return null;
 const rows=r.r1-r.r0+1,cols=r.c1-r.c0+1,problem=splitBlockProblem(rows,cols),fixed=delim==='fixed',cuts=fixed?parseWidths(widths):null;
 const names:Record<string,string>={',':'sheets.sp.comma',';':'sheets.sp.semicolon','\t':'sheets.sp.tab',' ':'sheets.sp.space','|':'sheets.sp.pipe',fixed:'sheets.sp.fixed'};
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.sp.title')}>
  <span>{t('sheets.sp.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.sp.by')}<NativeSelect className={field} value={delim} disabled={action.busy} onChange={e=>setDelim(e.currentTarget.value)} data-testid="sheets-sp-by">{[...SPLIT_DELIMITERS,'fixed'].map(d=><option key={d} value={d}>{t(names[d])}</option>)}</NativeSelect></label>
  {fixed?<label className="flex flex-col gap-1">{t('sheets.sp.widths')}<NativeInput className={field} value={widths} maxLength={80} aria-invalid={!!widths&&!cuts} disabled={action.busy} onChange={e=>setWidths(e.currentTarget.value)} data-testid="sheets-sp-widths"/></label>
   :<label className="flex flex-col gap-1">{t('sheets.sp.merge')}<NativeSelect className={field} value={merge?'yes':'no'} disabled={action.busy} onChange={e=>setMerge(e.currentTarget.value==='yes')} data-testid="sheets-sp-merge"><option value="no">{t('sheets.rp.no')}</option><option value="yes">{t('sheets.rp.yes')}</option></NativeSelect></label>}
  <Button variant="outline" size="compact" disabled={action.busy||!!problem||(fixed&&!cuts)} onClick={()=>void action.run('sheets.split',fixed?{kind:'fixed',widths:cuts}:{kind:'delimited',delimiters:[delim],treatConsecutive:merge})} data-testid="sheets-sp-apply">{t('sheets.sp.apply')}</Button>
  <p className="text-ink-3">{t(problem?'sheets.sp.need':'sheets.sp.scope',{range:rangeAddress(r)})}</p>
 </div>;
}
/** Finds and replaces literal text inside exactly the selected block. One undo step; the block is never widened. */
function ReplaceGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [what,setWhat]=useState('');const [to,setTo]=useState('');const [matchCase,setMatchCase]=useState(false);const [whole,setWhole]=useState(false);const [formulas,setFormulas]=useState(false);
 const r=s?.range;if(!s||!r)return null;
 const problem=replaceProblem(what,to),op={what,with:to,matchCase,wholeCell:whole,inFormulas:formulas};
 const yesNo=(label:string,value:boolean,set:(v:boolean)=>void,id:string)=><label className="flex flex-col gap-1">{label}<NativeSelect className={field} value={value?'yes':'no'} disabled={action.busy} onChange={e=>set(e.currentTarget.value==='yes')} data-testid={id}><option value="no">{t('sheets.rp.no')}</option><option value="yes">{t('sheets.rp.yes')}</option></NativeSelect></label>;
 const count=async()=>{try{const n=await getSheetsPanelController()?.countMatches(op);action.setNotice(t('sheets.rp.found',{n:String(n??0)}));}catch{action.setNotice(t('sheets.panel.failed'));}};
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.rp.title')}>
  <span>{t('sheets.rp.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.rp.what')}<NativeInput className={field} value={what} maxLength={MAX_REPLACE_TEXT} disabled={action.busy} aria-invalid={!!what&&problem==='what'} onChange={e=>setWhat(e.currentTarget.value)} data-testid="sheets-rp-what"/></label>
  <label className="flex flex-col gap-1">{t('sheets.rp.with')}<NativeInput className={field} value={to} maxLength={MAX_REPLACE_TEXT} disabled={action.busy} aria-invalid={problem==='with'} onChange={e=>setTo(e.currentTarget.value)} data-testid="sheets-rp-with"/></label>
  {yesNo(t('sheets.rp.case'),matchCase,setMatchCase,'sheets-rp-case')}
  {yesNo(t('sheets.rp.whole'),whole,setWhole,'sheets-rp-whole')}
  {yesNo(t('sheets.rp.formulas'),formulas,setFormulas,'sheets-rp-formulas')}
  <div className="flex flex-wrap gap-2">
   <Button variant="outline" size="compact" disabled={action.busy||!!problem} onClick={()=>void count()} data-testid="sheets-rp-count">{t('sheets.rp.count')}</Button>
   <Button variant="outline" size="compact" disabled={action.busy||!!problem} onClick={()=>void action.run('sheets.replace',op).then(n=>{if(n!==null)action.setNotice(t('sheets.rp.done'));})} data-testid="sheets-rp-apply">{t('sheets.rp.apply')}</Button>
  </div>
  <p className="text-ink-3">{t('sheets.rp.scope',{range:rangeAddress(r)})}</p>
 </div>;
}
/** Limits what can be typed into the selected block: a list of choices or number/length bounds. One undo step. Typed entries that break a rule are refused. */
const VALIDATION_OPERATORS:readonly CfOperator[]=['between','notBetween','equal','notEqual','greater','less','greaterOrEqual','lessOrEqual'];
function ValidationGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [choice,setChoice]=useState<ValidationChoice>('list');const [operator,setOperator]=useState<CfOperator>('between');const [a,setA]=useState('');const [b,setB]=useState('');
 const r=s?.range;if(!s||!r)return null;
 const numeric=choice==='whole'||choice==='decimal'||choice==='length',two=numeric&&(operator==='between'||operator==='notBetween'),op=buildValidationOp(choice,operator,a,b);
 const run=(o:object)=>void action.run('sheets.validation',o);
 const items=s.listItems;
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.dv.title')}>
  <span>{t('sheets.dv.title')}</span>
  {items&&items.length>0&&<label className="flex flex-col gap-1">{t('sheets.dv.pick')}<NativeSelect className={field} value="" disabled={action.busy} onChange={e=>{const v=e.currentTarget.value;if(v)void action.run('sheets.setCell',{input:v});}} data-testid="sheets-dv-pick"><option value="">{t('sheets.dv.pickNone')}</option>{items.map(i=><option key={i} value={i}>{i}</option>)}</NativeSelect></label>}
  <label className="flex flex-col gap-1">{t('sheets.dv.allow')}<NativeSelect className={field} value={choice} disabled={action.busy} onChange={e=>setChoice(e.currentTarget.value as ValidationChoice)} data-testid="sheets-dv-kind">{VALIDATION_CHOICES.map(c=><option key={c} value={c}>{t('sheets.dv.kind.'+c)}</option>)}</NativeSelect></label>
  {numeric&&<label className="flex flex-col gap-1">{t('sheets.dv.operator')}<NativeSelect className={field} value={operator} disabled={action.busy} onChange={e=>setOperator(e.currentTarget.value as CfOperator)} data-testid="sheets-dv-operator">{VALIDATION_OPERATORS.map(c=><option key={c} value={c}>{t('sheets.dv.op.'+c)}</option>)}</NativeSelect></label>}
  <label className="flex flex-col gap-1">{t(choice==='list'?'sheets.dv.items':choice==='listRange'?'sheets.dv.source':'sheets.dv.value')}<NativeInput className={field} value={a} maxLength={choice==='list'?MAX_ITEM_CHARS*20:32} disabled={action.busy} onChange={e=>setA(e.currentTarget.value)} data-testid="sheets-dv-value"/></label>
  {two&&<label className="flex flex-col gap-1">{t('sheets.dv.value2')}<NativeInput className={field} value={b} maxLength={32} disabled={action.busy} onChange={e=>setB(e.currentTarget.value)} data-testid="sheets-dv-value2"/></label>}
  <div className="flex flex-wrap gap-2">
   <Button variant="outline" size="compact" disabled={action.busy||!op} onClick={()=>op&&run(op)} data-testid="sheets-dv-apply">{t('sheets.dv.apply')}</Button>
   <Button variant="outline" size="compact" disabled={action.busy} onClick={()=>run({kind:'clear'})} data-testid="sheets-dv-clear">{t('sheets.dv.clear')}</Button>
  </div>
  <p className="text-ink-3">{t('sheets.dv.scope',{range:rangeAddress(r)})}</p>
 </div>;
}
/** Highlights cells of the selected block by a rule or a color scale. One undo step; rules can be cleared for the block or the sheet. */
function HighlightGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [choice,setChoice]=useState<CfChoice>('greater');const [a,setA]=useState('');const [b,setB]=useState('');const [style,setStyle]=useState<CfStyle>('lightRed');
 const r=s?.range;if(!s||!r)return null;
 const cells=(r.r1-r.r0+1)*(r.c1-r.c0+1),need=cfChoiceNeeds(choice),op=buildCfOp(choice,a,b,style,cells),scale=choice.startsWith('scale');
 const run=(o:object)=>void action.run('sheets.highlight',o);
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.hl.title')}>
  <span>{t('sheets.hl.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.hl.rule')}<NativeSelect className={field} value={choice} disabled={action.busy} onChange={e=>setChoice(e.currentTarget.value as CfChoice)} data-testid="sheets-hl-rule">{CF_CHOICES.map(c=><option key={c} value={c}>{t('sheets.hl.rule.'+c)}</option>)}</NativeSelect></label>
  {need!=='none'&&<label className="flex flex-col gap-1">{t(need==='rank'?'sheets.hl.count':need==='text'?'sheets.hl.text':'sheets.hl.value')}<NativeInput className={field} value={a} maxLength={MAX_CF_TEXT} disabled={action.busy} onChange={e=>setA(e.currentTarget.value)} data-testid="sheets-hl-value"/></label>}
  {need==='two'&&<label className="flex flex-col gap-1">{t('sheets.hl.value2')}<NativeInput className={field} value={b} maxLength={MAX_CF_TEXT} disabled={action.busy} onChange={e=>setB(e.currentTarget.value)} data-testid="sheets-hl-value2"/></label>}
  {!scale&&<label className="flex flex-col gap-1">{t('sheets.hl.style')}<NativeSelect className={field} value={style} disabled={action.busy} onChange={e=>setStyle(e.currentTarget.value as CfStyle)} data-testid="sheets-hl-style">{CF_STYLES.map(c=><option key={c} value={c}>{t('sheets.hl.style.'+c)}</option>)}</NativeSelect></label>}
  <div className="flex flex-wrap gap-2">
   <Button variant="outline" size="compact" disabled={action.busy||!op} onClick={()=>op&&run(op)} data-testid="sheets-hl-apply">{t('sheets.hl.apply')}</Button>
   <Button variant="outline" size="compact" disabled={action.busy} onClick={()=>run({kind:'clear'})} data-testid="sheets-hl-clear">{t('sheets.hl.clear')}</Button>
   <Button variant="outline" size="compact" disabled={action.busy} onClick={()=>run({kind:'clearAll'})} data-testid="sheets-hl-clear-all">{t('sheets.hl.clearAll')}</Button>
  </div>
  <p className="text-ink-3">{t('sheets.hl.scope',{range:rangeAddress(r)})}</p>
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
