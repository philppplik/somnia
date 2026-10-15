import '../../lib/sheets/panelI18n';
import {useEffect,useRef,useState,useSyncExternalStore,type ReactNode} from 'react';
import {useT} from '../../lib/useT';
import {usePanelState} from '../../store/panelStateStore';
import {getSheetsSelection,setFillMode,subscribeSheets,useFillMode,useSheetsSelection} from '../../lib/sheets/sheetsStore';
import {getFormulasFocusRequest,subscribeFormulasFocus} from '../../lib/sheets/formulasFocus';
import {cellHasContent,formulaTargetProblem} from '../../lib/sheets/formulaTarget';
import {sheetsPanelDefs} from '../../lib/sheets/panels';
import type {PanelHostProps,InspectorSectionProps} from '../../lib/shell/types';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {aggregateFormula,FORMULA_FUNCTIONS,parsePanelRange,rangeAddress,summarizeCells} from '../../lib/sheets/panelModel';
import {rectCells} from '../../lib/sheets/clipboard';
import {addressOf,colName,parseAddress,parseSpan} from '../../lib/sheets/format';
import {sortBlockProblem} from '../../lib/sheets/sortOps';
import {parseShiftCommand,shiftBlockProblem,type ShiftKind,parseSpecialResult,SPECIAL_KINDS,type SpecialKind,type SpecialResult} from '../../lib/sheets/specialOps';
import {addUserWord,checkCells,loadDictionary,readUserWords,replacementProblem,suggest,type SpellReport} from '../../lib/sheets/spelling';
import {AUTOFILL_MODES,buildSeriesOp,fillBlockProblem,FILL_DIRECTIONS,SERIES_KINDS,type AutoFillMode,type SeriesKind} from '../../lib/sheets/fillOps';
import type {FillDirection,CfStyle,PasteOp} from '../../lib/sheets/protocol';
import {PIVOT_FUNCS,tableBlockProblem} from '../../lib/sheets/tableOps';
import {appendHeaderCode,headerProblem,HF_CODES,MAX_HEADER_CHARS,previewHeaderFooter} from '../../lib/sheets/printOps';
import {MAX_ZOOM,MIN_ZOOM} from '../../lib/sheets/viewOps';
import {describeCfRule} from '../../lib/sheets/cfManageOps';
import {CHART_COLORS,MAX_TITLE_CHARS,sparklineBlockProblem} from '../../lib/sheets/chartOps';
import {OBJECT_GROUPS,SHAPE_FILLS,SHAPE_LINES,MAX_PICTURE_BYTES,MAX_SHAPE_TEXT,MAX_ALT,buildObjectOp,bytesToBase64,objectIsShape,objectNeedsPick,type ObjectAction} from '../../lib/sheets/objectOps';
import {layoutBlockProblem,MERGE_HOWS,ROTATE_MODES} from '../../lib/sheets/layoutOps';
import {Checkbox} from '../ui/checkbox';
import {PIVOT_AREAS,PIVOT_VALUE_FUNCS,PIVOT_SHOW_AS,PIVOT_NUMBER_FORMATS,PIVOT_LAYOUTS,PIVOT_SUBTOTALS,PIVOT_GROUPS,PIVOT_ORDERS,PIVOT_STYLES,MAX_PIVOT_ITEMS,pivotSourceProblem} from '../../lib/sheets/pivotEditOps';
import type {PivotArea,PivotValueFunc,PivotEditOp} from '../../lib/sheets/protocol';
import {CONSOLIDATE_FUNCTIONS,dataToolProblem,parseSourceList} from '../../lib/sheets/dataToolOps';
import {pageStart} from '../../lib/sheets/pageBreaks';
import {SYMBOL_GROUPS,isSymbol,symbolCode,type SymbolGroup} from '../../lib/sheets/symbols';
import {CELL_STYLE_GROUPS,AUTOSUM_FUNCTIONS,cellToolProblem,toolFromChoice,cleanStyleName,filterFunctions,functionCategories} from '../../lib/sheets/cellToolOps';
import {SUBTOTAL_FUNCS,MAX_SUBTOTAL_ROWS,parseColumnList,type SubtotalFunc} from '../../lib/sheets/outlineOps';
import {viewNameProblem,MAX_VIEW_NAME} from '../../lib/sheets/savedViews';
import {WHATIF_GROUPS,buildWhatIfOp,whatIfNeeds,type WhatIfAction} from '../../lib/sheets/whatIfOps';
import {ALLOW_PRESETS,MAX_PASSWORD_CHARS,PROTECT_ALLOW,passwordBad} from '../../lib/sheets/protectOps';
import type {PivotField,PivotFunc} from '../../lib/sheets/protocol';
import {filterNames,NAME_FILTERS,MAX_NAME_QUERY,type NameFilter,resolveNameJump,constantValue,MAX_COMMENT_CHARS,nameProblem,nameSpan,nameTarget} from '../../lib/sheets/names';
import {internalTarget,linkTargetProblem,MAX_LINK_TEXT,MAX_NOTE_CHARS} from '../../lib/sheets/notes';
import {dedupeBlockProblem,splitBlockProblem,parseWidths,SPLIT_DELIMITERS} from '../../lib/sheets/dataTools';
import {replaceProblem,MAX_REPLACE_TEXT} from '../../lib/sheets/replaceOps';
import {getSheetsPanelController} from '../../lib/sheets/panelController';
import {describeValidationRule,VALIDATION_CHOICES,buildValidationOp,MAX_ITEM_CHARS,type ValidationChoice} from '../../lib/sheets/validationOps';
import type {CfOperator} from '../../lib/sheets/protocol';
import {CF_CHOICE_GROUPS,CF_STYLES,buildCfOp,cfChoiceIsVisual,cfChoiceNeeds,MAX_CF_TEXT,type CfChoice} from '../../lib/sheets/cfOps';
import {FILTER_CONDITIONS,MAX_FILTER_VALUE,filterValueProblem} from '../../lib/sheets/filterOps';
import {MAX_SHEETS,sheetNameProblem,TAB_COLORS,safeTabColor} from '../../lib/sheets/sheetOps';
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
 const jump=parseSpan(address)?{sheet:s.sheet,address}:resolveNameJump(address,s.names??[],sheetList,s.sheetName);
 const sheets=s.workbook?.sheets.filter(sheet=>sheet.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()))??[];
 return <Region><p className="break-all font-semibold">{s.file}</p>
 <input className={field} aria-label={t('sheets.panel.filter')} placeholder={t('sheets.panel.filter')} value={filter} onChange={e=>setFilter(e.target.value)}/>
 <div className="flex flex-col gap-1" role="group" aria-label={t('sheets.tabs')}>{sheets.map(sheet=><button className={button+' text-left'} key={sheet.index} disabled={sheet.visibility!=='Visible'||action.busy} aria-pressed={sheet.index===s.sheet} onClick={()=>void action.run('sheets.navigate',{sheet:sheet.index,address:'A1'})}>{sheet.name}{sheet.visibility!=='Visible'&&<span className="ml-2 text-ink-3">{t('sheets.panel.hidden')}</span>}</button>)}{!sheets.length&&<p>{t('sheets.panel.noMatches')}</p>}</div>
 <form className="flex gap-1" onSubmit={e=>{e.preventDefault();if(!jump)return;void action.run('sheets.navigate',jump);}}><input className={field} aria-label={t('sheets.address')} value={address} onChange={e=>setAddress(e.target.value)} autoCapitalize="characters"/><button className={button} disabled={action.busy||!jump}>{t('sheets.panel.go')}</button></form>
 <p className="text-ink-3">{t('sheets.panel.addressHint')}</p>
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
 const visibleNames=(s.names??[]).filter(n=>n.scope==='Workbook'||n.scope===s.sheetName),nameHit=visibleNames.find(n=>n.name.toLowerCase()===source.trim().toLowerCase());
 const nameSpanText=nameHit&&nameTarget(nameHit.refersTo)?.sheet.toLowerCase()===s.sheetName.toLowerCase()?nameSpan(nameHit.refersTo):null;
 let formula='';try{formula=aggregateFormula(fn,source,visibleNames.map(n=>n.name));}catch{/* invalid source disables apply */}
 const problem=formulaTargetProblem(source,target,nameSpanText);
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
 return <Region><label className="flex flex-col gap-1">{t('sheets.panel.function')}<select ref={fnField} className={field} value={fn} onChange={e=>setFn(e.target.value)}>{FORMULA_FUNCTIONS.map(f=><option key={f}>{f}</option>)}</select></label><label className="flex flex-col gap-1">{t('sheets.panel.source')}<input className={field} value={source} onChange={e=>setSource(e.target.value)}/></label>{visibleNames.length>0&&<label className="flex flex-col gap-1">{t('sheets.panel.useName')}<NativeSelect className={field} value="" onChange={e=>{if(e.currentTarget.value)setSource(e.currentTarget.value);}} data-testid="sheets-formula-name"><option value="">{t('sheets.panel.useNameNone')}</option>{visibleNames.map(n=><option key={n.scope+'|'+n.name} value={n.name}>{n.name}</option>)}</NativeSelect></label>}<button className={button} onClick={()=>setSource(s.range?rangeAddress(s.range):s.address)}>{t('sheets.panel.follow')}</button><code className="break-all rounded-lg bg-hover p-2">{formula||'...'}</code><label className="flex flex-col gap-1">{t('sheets.panel.target')}<input className={field} value={target} onChange={e=>{setTarget(e.target.value);setReplaceTarget(null);}} placeholder="B3" data-testid="sheets-formula-target" autoCapitalize="characters" spellCheck={false}/></label><button className={button} onClick={()=>{setTarget(s.address);setReplaceTarget(null);}}>{t('sheets.panel.useCell')}</button><p className="text-ink-3">{t('sheets.panel.targetWarning')}</p>{problem==='empty'&&<p className="text-ink-3">{t('sheets.panel.targetEmpty')}</p>}{problem==='invalid'&&<p role="alert">{t('sheets.panel.targetInvalid')}</p>}{problem==='circular'&&<p role="alert">{t('sheets.panel.circular')}</p>}{confirming&&<div role="alert" className="flex flex-col gap-2 rounded-lg border border-subtle p-2" data-testid="sheets-formula-replace"><p>{t('sheets.panel.replaceConfirm',{address:canonical})}</p><div className="flex gap-1"><button className={button} disabled={action.busy} onClick={()=>void apply(true)}>{t('sheets.panel.replace')}</button><button className={button} onClick={()=>setReplaceTarget(null)}>{t('sheets.panel.cancel')}</button></div></div>}<button className={button} disabled={!formula||problem!==null||action.busy||context.document?.readOnly} onClick={()=>void apply(false)} data-testid="sheets-formula-apply">{t('sheets.panel.applyFormula')}</button><p role="status">{action.notice}</p></Region>;
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
  <CfRulesGroup/>
  <ValidationRulesGroup/>
  <ValidationGroup/>
  <ReplaceGroup/>
  <DedupeGroup/>
  <ShiftCellsGroup/>
  <NotesGroup/>
  <NoteListGroup/>
  <AuditGroup/>
  <SymbolGroup/>
  <ReviewInfoGroup/>
  <SpellingGroup/>
  <FindSpecialGroup/>
  <CellInfoGroup/>
  <PageBreaksGroup/>
  <PasteGroup/>
  <NamesGroup/>
  <ViewGroup/>
  <ChartsGroup/>
  <ProtectGroup/>
  <WhatIfGroup/>
  <ObjectsGroup/>
  <CellLayoutGroup/>
  <CellToolsGroup/>
  <SavedStylesGroup/>
  <InsertFunctionGroup/>
  <DataToolsGroup/>
  <SheetTabGroup/>
  <OutlineGroup/>
  <SavedViewsGroup/>
  <TablesGroup/>
  <PivotGroup/>
  <PivotEditGroup/>
  <PrintGroup/>
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
type TableAction='go'|'create'|'totalsOn'|'totalsOff'|'bandedOn'|'bandedOff'|'style'|'rename'|'convert'|'resize';
function TablesGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [act,setAct]=useState<TableAction>('create');const [pick,setPick]=useState('');const [name,setName]=useState('');const [style,setStyle]=useState('TableStyleMedium2');
 const r=s?.range;if(!s||!r)return null;
 const list=s.tables?.tables??[],styles=s.tables?.styles??[],chosen=list.find(x=>x.name===pick)??list[0]??null,creating=act==='create',naming=creating||act==='rename';
 const block=tableBlockProblem(r.r1-r.r0+1,r.c1-r.c0+1),nameBad=name.trim()!==''&&!!nameProblem(name.trim());
 const problem=creating?(block||nameBad?'x':null):(!chosen||(act==='rename'&&(name.trim()===''||nameBad))||(act==='resize'&&block)?'x':null);
 const apply=()=>{
  if(creating)void action.run('sheets.table',{kind:'create',...(name.trim()?{name:name.trim()}:{}),style}).then(x=>{if(x!==null)setName('');});
  else if(chosen&&act==='style')void action.run('sheets.table',{kind:'style',table:chosen.name,style});
  else if(chosen&&act==='rename')void action.run('sheets.table',{kind:'rename',table:chosen.name,newName:name.trim()}).then(x=>{if(x!==null){setName('');setPick(name.trim());}});
  else if(chosen&&act==='go')void action.run('sheets.navigate',{sheet:s.sheet,address:chosen.range});
  else if(chosen&&act==='convert')void action.run('sheets.table',{kind:'convert',table:chosen.name});
  else if(chosen&&act==='resize')void action.run('sheets.table',{kind:'resize',table:chosen.name});
  else if(chosen)void action.run('sheets.table',{kind:act.startsWith('totals')?'totals':'banded',table:chosen.name,on:act.endsWith('On')});
 };
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.tb.title')}>
  <span>{t('sheets.tb.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.tb.existing')}<NativeSelect className={field} value={chosen?.name??''} disabled={action.busy||list.length===0} onChange={e=>setPick(e.currentTarget.value)} data-testid="sheets-tb-pick">{list.length===0&&<option value="">{t('sheets.tb.none')}</option>}{list.map(x=><option key={x.name} value={x.name}>{x.name} {x.range}</option>)}</NativeSelect></label>
  {chosen&&<div className="flex flex-col gap-1" role="group" aria-label={t('sheets.tb.options')}>
   <span className="text-ink-3">{t('sheets.tb.options')}</span>
   {([['bandedCols',chosen.bandedCols],['firstCol',chosen.firstCol],['lastCol',chosen.lastCol]] as const).map(([k,on])=><Checkbox key={k} label={t('sheets.tb.opt.'+k)} checked={on} disabled={action.busy} onChange={e=>void action.run('sheets.table',{kind:k,table:chosen.name,on:e.currentTarget.checked})}/>)}
  </div>}
  <label className="flex flex-col gap-1">{t('sheets.nm.action')}<NativeSelect className={field} value={act} disabled={action.busy} onChange={e=>setAct(e.currentTarget.value as TableAction)} data-testid="sheets-tb-action">
   <optgroup label={t('sheets.nm.groupSelection')}><option value="create">{t('sheets.tb.create')}</option></optgroup>
   <optgroup label={t('sheets.tb.groupTable')}><option value="go">{t('sheets.tb.go')}</option><option value="totalsOn">{t('sheets.tb.totalsOn')}</option><option value="totalsOff">{t('sheets.tb.totalsOff')}</option><option value="bandedOn">{t('sheets.tb.bandedOn')}</option><option value="bandedOff">{t('sheets.tb.bandedOff')}</option><option value="style">{t('sheets.tb.style')}</option><option value="rename">{t('sheets.tb.rename')}</option><option value="convert">{t('sheets.tb.convert')}</option><option value="resize">{t('sheets.tb.resize')}</option></optgroup>
  </NativeSelect></label>
  {(creating||act==='style')&&<label className="flex flex-col gap-1">{t('sheets.tb.styleName')}<NativeSelect className={field} value={style} disabled={action.busy} onChange={e=>setStyle(e.currentTarget.value)} data-testid="sheets-tb-style">{(styles.length?styles:[style]).map(x=><option key={x} value={x}>{x.replace('TableStyle','')}</option>)}</NativeSelect></label>}
  {naming&&<label className="flex flex-col gap-1">{creating?t('sheets.tb.nameOptional'):t('sheets.tb.newName')}<NativeInput className={field} value={name} maxLength={64} aria-invalid={nameBad} disabled={action.busy} onChange={e=>setName(e.currentTarget.value)} data-testid="sheets-tb-name"/></label>}
  <Button variant="outline" size="compact" disabled={action.busy||!!problem} onClick={apply} data-testid="sheets-tb-apply">{t('sheets.nm.apply')}</Button>
  <p className="text-ink-3">{t(creating?'sheets.tb.scope':act==='resize'?'sheets.tb.resizeNote':'sheets.tb.scopeTable',{range:rangeAddress(r)})}</p>
 </div>;
}
/** Charts and sparklines in one grouped menu: make a chart from the selection, change or delete one of this sheet's charts, or add a sparkline. One undo step each. */
type ChartAction=string;
const CHART_CREATE:Record<string,{type:string;subtype?:string}>={createColumn:{type:'column'},createColumnStacked:{type:'column',subtype:'stacked'},createBar:{type:'bar'},createLine:{type:'line'},createLineMarkers:{type:'line',subtype:'markers'},createArea:{type:'area'},createPie:{type:'pie'},createDoughnut:{type:'doughnut'},createScatter:{type:'scatter'},createRadar:{type:'radar'},createHistogram:{type:'histogram'},createWaterfall:{type:'waterfall'},createFunnel:{type:'funnel'},createTreemap:{type:'treemap'}};
const CHART_TYPE:Record<string,{type:string;subtype?:string}>={ctColumn:{type:'column'},ctColumnStacked:{type:'column',subtype:'stacked'},ctColumn100:{type:'column',subtype:'stacked100'},ctBar:{type:'bar'},ctBarStacked:{type:'bar',subtype:'stacked'},ctLine:{type:'line'},ctLineMarkers:{type:'line',subtype:'markers'},ctArea:{type:'area'},ctPie:{type:'pie'},ctDoughnut:{type:'doughnut'},ctScatter:{type:'scatter'},ctScatterLines:{type:'scatter',subtype:'lines'},ctRadar:{type:'radar'},ctHistogram:{type:'histogram'},ctWaterfall:{type:'waterfall'},ctFunnel:{type:'funnel'},ctTreemap:{type:'treemap'}};
const CHART_PALETTE_IDS=['colorful','monochrome','accent1','accent2','accent3','accent4','accent5','accent6'];
const CHART_LAYOUT_IDS=['1','2','3','4','5','6'],CHART_LEGEND_IDS=['none','bottom','top','left','right'];
/** Change actions that need one extra choice, and the choices they offer. */
const CHART_ARG_ACTIONS=['changeType','palette','seriesColor','layout','legendPos','moveSheet'];
const CHART_SIZE:Record<string,[number,number]>={sizeSmall:[360,216],sizeMedium:[480,288],sizeLarge:[720,432]};
const CHART_FLAGS:Record<string,Record<string,unknown>>={axisTitlesOn:{element:'axisTitles',on:true},axisTitlesOff:{element:'axisTitles',on:false},titleOff:{element:'title',on:false},labelsOn:{dataLabels:true},labelsOff:{dataLabels:false},gridOn:{gridlines:true},gridOff:{gridlines:false}};
const SPARK_ACTIONS:Record<string,string>={sparkLine:'line',sparkColumn:'column',sparkWinLoss:'winLoss'};
function ChartsGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [act,setAct]=useState<ChartAction>('createColumn');const [pick,setPick]=useState(0);const [text,setText]=useState('');const [style,setStyle]=useState(1);const [arg,setArg]=useState('');const [seriesPick,setSeriesPick]=useState(0);
 const r=s?.range;if(!s||!r)return null;
 const otherSheets=(s.workbook?.sheets??[]).filter(x=>x.index!==s.sheet&&x.visibility==='Visible').map(x=>x.name);
 const argIds:string[]=act==='changeType'?Object.keys(CHART_TYPE):act==='palette'?CHART_PALETTE_IDS:act==='seriesColor'?Object.keys(CHART_COLORS):act==='layout'?CHART_LAYOUT_IDS:act==='legendPos'?CHART_LEGEND_IDS:act==='moveSheet'?otherSheets:[];
 const argVal=argIds.includes(arg)?arg:argIds[0]??'';
 const list=s.charts??[],chosen=list.find(x=>x.id===pick)??list[0]??null;
 const creating=act in CHART_CREATE,spark=act in SPARK_ACTIONS,titled=act==='title2'||act==='xTitle'||act==='yTitle',styled=act==='style';
 const rows=r.r1-r.r0+1,cols=r.c1-r.c0+1;
 const problem=creating?(tableBlockProblem(rows,cols)==='large'||rows*cols<2?'x':null):spark?(sparklineBlockProblem(rows,cols)?'x':null):!chosen||(CHART_ARG_ACTIONS.includes(act)&&!argVal)||(titled&&text.trim()===''&&act!=='title2')?'x':null;
 const apply=()=>{
  if(creating)return void action.run('sheets.chart',{kind:'create',...CHART_CREATE[act]});
  if(spark)return void action.run('sheets.sparkline',{type:SPARK_ACTIONS[act]});
  if(!chosen)return;const chart=chosen.id;
  if(act==='delete')void action.run('sheets.chart',{kind:'delete',chart});
  else if(act==='switch')void action.run('sheets.chart',{kind:'switch',chart});
  else if(act==='changeType')void action.run('sheets.chart',{kind:'set',chart,type:CHART_TYPE[argVal].type,subtype:CHART_TYPE[argVal].subtype??'clustered'});
  else if(act==='palette')void action.run('sheets.chart',{kind:'palette',chart,palette:argVal});
  else if(act==='seriesColor')void action.run('sheets.chart',{kind:'color',chart,series:Math.min(seriesPick,Math.max(0,chosen.series-1)),color:CHART_COLORS[argVal as keyof typeof CHART_COLORS]});
  else if(act==='layout')void action.run('sheets.chart',{kind:'layout',chart,layout:Number(argVal)});
  else if(act==='legendPos')void action.run('sheets.chart',{kind:'set',chart,legend:argVal});
  else if(act==='moveSheet')void action.run('sheets.chart',{kind:'moveSheet',chart,sheet:argVal});
  else if(act==='selectData')void action.run('sheets.chart',{kind:'data',chart});
  else if(act==='title2')void action.run('sheets.chart',{kind:'set',chart,title:text});
  else if(act==='xTitle')void action.run('sheets.chart',{kind:'set',chart,xTitle:text});
  else if(act==='yTitle')void action.run('sheets.chart',{kind:'set',chart,yTitle:text});
  else if(act==='style')void action.run('sheets.chart',{kind:'set',chart,style});
  else if(act==='moveHere')void action.run('sheets.chart',{kind:'set',chart,at:rangeAddress({...r,r1:r.r0,c1:r.c0})});
  else if(act in CHART_SIZE)void action.run('sheets.chart',{kind:'set',chart,width:CHART_SIZE[act][0],height:CHART_SIZE[act][1]});
  else if(act in CHART_FLAGS)void action.run('sheets.chart',{kind:'set',chart,...CHART_FLAGS[act]});
 };
 const opts=(ids:string[])=>ids.map(id=><option key={id} value={id}>{t('sheets.ch.'+id)}</option>);
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.ch.title')}>
  <span>{t('sheets.ch.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.ch.existing')}<NativeSelect className={field} value={chosen?.id??''} disabled={action.busy||list.length===0} onChange={e=>setPick(Number(e.currentTarget.value))} data-testid="sheets-ch-pick">{list.length===0&&<option value="">{t('sheets.ch.none')}</option>}{list.map(x=><option key={x.id} value={x.id}>{x.title||t('sheets.ch.chartName',{id:x.id})}</option>)}</NativeSelect></label>
  <label className="flex flex-col gap-1">{t('sheets.ch.action')}<NativeSelect className={field} value={act} disabled={action.busy} onChange={e=>setAct(e.currentTarget.value)} data-testid="sheets-ch-action">
   <optgroup label={t('sheets.ch.groupCreate')}>{opts(Object.keys(CHART_CREATE))}</optgroup>
   <optgroup label={t('sheets.ch.groupChange')}>{opts(['changeType','switch','selectData','title2','titleOff','xTitle','yTitle',...Object.keys(CHART_FLAGS),'legendPos','layout','palette','seriesColor','style','moveHere',...(otherSheets.length?['moveSheet']:[]),...Object.keys(CHART_SIZE),'delete'])}</optgroup>
   <optgroup label={t('sheets.ch.groupSpark')}>{opts(Object.keys(SPARK_ACTIONS))}</optgroup>
  </NativeSelect></label>
  {argIds.length>0&&<label className="flex flex-col gap-1">{t('sheets.ch.arg.'+act)}<NativeSelect className={field} value={argVal} disabled={action.busy} onChange={e=>setArg(e.currentTarget.value)} data-testid="sheets-ch-arg">{argIds.map(id=><option key={id} value={id}>{act==='moveSheet'?id:t('sheets.ch.'+(act==='changeType'?'':act==='palette'?'pal.':act==='seriesColor'?'col.':act==='layout'?'lay.':'leg.')+id)}</option>)}</NativeSelect></label>}
  {act==='seriesColor'&&chosen&&<label className="flex flex-col gap-1">{t('sheets.ch.arg.series')}<NativeSelect className={field} value={Math.min(seriesPick,Math.max(0,chosen.series-1))} disabled={action.busy} onChange={e=>setSeriesPick(Number(e.currentTarget.value))} data-testid="sheets-ch-series">{Array.from({length:Math.min(64,Math.max(1,chosen.series))},(_,i)=><option key={i} value={i}>{t('sheets.ch.seriesN',{n:i+1})}</option>)}</NativeSelect></label>}
  {titled&&<label className="flex flex-col gap-1">{t('sheets.ch.text')}<NativeInput className={field} value={text} maxLength={MAX_TITLE_CHARS} disabled={action.busy} onChange={e=>setText(e.currentTarget.value)} data-testid="sheets-ch-text"/></label>}
  {styled&&<NumberField label={t('sheets.ch.styleLabel')} value={style} resetKey="chart-style" min={1} max={16} step={1} disabled={action.busy} constraintError={t('sheets.ch.styleInvalid')} parse={v=>{const n=Number(v.trim());return v.trim()&&Number.isInteger(n)&&n>=1&&n<=16?{ok:true,value:n}:{ok:false,error:t('sheets.ch.styleInvalid')};}} onCommit={v=>setStyle(v)}/>}
  <Button variant="outline" size="compact" disabled={action.busy||!!problem} onClick={apply} data-testid="sheets-ch-apply">{t('sheets.ch.apply')}</Button>
  <p className="text-ink-3">{t(spark?'sheets.ch.scopeSpark':'sheets.ch.scopeCreate',{range:rangeAddress(r)})}</p>
 </div>;
}
/** Protection in one grouped menu: lock or unlock the selected cells, protect or unprotect the sheet (optional password, what stays allowed) and lock the sheet structure. One undo step each. */
type ProtectAction='lock'|'unlock'|'protect'|'unprotect'|'bookLock'|'bookUnlock';
function ProtectGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [act,setAct]=useState<ProtectAction>('lock');const [allow,setAllow]=useState('none');const [picked,setPicked]=useState<readonly string[]>([]);const [pw,setPw]=useState('');
 const layout=s?.layout;if(!s||!layout)return null;
 const prot=layout.protection??null,asksPw=act==='protect'||(act==='unprotect'&&!!prot?.password),pwBad=passwordBad(pw);
 const off=(act==='lock'||act==='unlock')?!!prot:act==='protect'?!!prot:act==='unprotect'?!prot:false;
 const apply=()=>{
  const done=(x:unknown)=>{if(x!==null)setPw('');};
  if(act==='lock'||act==='unlock')void action.run('sheets.protect',{kind:'lock',locked:act==='lock'});
  else if(act==='protect')void action.run('sheets.protect',{kind:'protect',...(pw?{password:pw}:{}),allow:allow==='custom'?PROTECT_ALLOW.filter(p=>picked.includes(p)):[...(ALLOW_PRESETS[allow]??[])]}).then(done);
  else if(act==='unprotect')void action.run('sheets.protect',{kind:'unprotect',...(pw?{password:pw}:{})}).then(done);
  else void action.run('sheets.protect',{kind:'workbook',on:act==='bookLock'});
 };
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.pt.title')}>
  <span>{t('sheets.pt.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.pt.action')}<NativeSelect className={field} value={act} disabled={action.busy} onChange={e=>setAct(e.currentTarget.value as ProtectAction)} data-testid="sheets-pt-action">
   <optgroup label={t('sheets.pt.groupCells')}><option value="lock">{t('sheets.pt.lock')}</option><option value="unlock">{t('sheets.pt.unlock')}</option></optgroup>
   <optgroup label={t('sheets.pt.groupSheet')}><option value="protect">{t('sheets.pt.protect')}</option><option value="unprotect">{t('sheets.pt.unprotect')}</option></optgroup>
   <optgroup label={t('sheets.pt.groupBook')}><option value="bookLock">{t('sheets.pt.bookLock')}</option><option value="bookUnlock">{t('sheets.pt.bookUnlock')}</option></optgroup>
  </NativeSelect></label>
  {act==='protect'&&<label className="flex flex-col gap-1">{t('sheets.pt.allowLabel')}<NativeSelect className={field} value={allow} disabled={action.busy} onChange={e=>setAllow(e.currentTarget.value)} data-testid="sheets-pt-allow">{[...Object.keys(ALLOW_PRESETS),'custom'].map(k=><option key={k} value={k}>{t('sheets.pt.allow.'+k)}</option>)}</NativeSelect></label>}
  {act==='protect'&&allow==='custom'&&PROTECT_ALLOW.map(p=><Checkbox key={p} label={t('sheets.pt.perm.'+p)} checked={picked.includes(p)} disabled={action.busy} onChange={e=>{const on=e.currentTarget.checked;setPicked(l=>on?[...l.filter(x=>x!==p),p]:l.filter(x=>x!==p));}}/>)}
  {asksPw&&<label className="flex flex-col gap-1">{act==='protect'?t('sheets.pt.password'):t('sheets.pt.passwordNeeded')}<NativeInput className={field} type="password" autoComplete="off" value={pw} maxLength={MAX_PASSWORD_CHARS} aria-invalid={pwBad} disabled={action.busy} onChange={e=>setPw(e.currentTarget.value)} data-testid="sheets-pt-password"/></label>}
  <Button variant="outline" size="compact" disabled={action.busy||off||pwBad} onClick={apply} data-testid="sheets-pt-apply">{t('sheets.pt.apply')}</Button>
  <p className="text-ink-3">{prot?t('sheets.pt.stateOn',{password:prot.password?t('sheets.pt.withPassword'):''}):t('sheets.pt.stateOff')}{layout.workbookLocked?' '+t('sheets.pt.bookOn'):''}</p>
  <p className="text-ink-3">{t('sheets.pt.hint')}</p>
 </div>;
}
/** Goal seek, scenarios and data tables in one grouped menu. Fields in, typed op out; each action is one undo step. */
function WhatIfGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [act,setAct]=useState<WhatIfAction>('goalSeek');
 const [f,setF]=useState({set:'',to:'',changing:'',name:'',pick:'',results:'',rowInput:'',columnInput:''});const r=s?.range;
 if(!s||!r)return null;
 const need=whatIfNeeds(act),list=s.scenarios??[],selection=rangeAddress(r),cells=(r.r1-r.r0+1)*(r.c1-r.c0+1);
 const op=buildWhatIfOp(act,{...f,selection,selectionCells:cells}),on=(k:keyof typeof f)=>(e:React.ChangeEvent<HTMLInputElement>)=>setF(x=>({...x,[k]:e.currentTarget.value}));
 const input=(k:keyof typeof f,label:string,max:number)=><label className="flex flex-col gap-1">{label}<NativeInput className={field} value={f[k]} maxLength={max} disabled={action.busy} onChange={on(k)} data-testid={'sheets-wi-'+k}/></label>;
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.wi.title')}>
  <span>{t('sheets.wi.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.wi.action')}<NativeSelect className={field} value={act} disabled={action.busy} onChange={e=>setAct(e.currentTarget.value as WhatIfAction)} data-testid="sheets-wi-action">{WHATIF_GROUPS.map(([g,items])=><optgroup key={g} label={t('sheets.wi.group.'+g)}>{items.map(a=><option key={a} value={a}>{t('sheets.wi.act.'+a)}</option>)}</optgroup>)}</NativeSelect></label>
  {need.set&&input('set',t('sheets.wi.set'),12)}
  {need.to&&input('to',t('sheets.wi.to'),24)}
  {need.changing&&input('changing',t('sheets.wi.changing'),12)}
  {need.name&&input('name',t('sheets.wi.name'),255)}
  {need.pick&&<label className="flex flex-col gap-1">{t('sheets.wi.pick')}<NativeSelect className={field} value={f.pick} disabled={action.busy} onChange={e=>setF(x=>({...x,pick:e.currentTarget.value}))} data-testid="sheets-wi-pick"><option value="">{t('sheets.wi.pickNone')}</option>{list.map(x=><option key={x.name} value={x.name}>{x.name} ({x.changing})</option>)}</NativeSelect></label>}
  {need.results&&input('results',t('sheets.wi.results'),200)}
  {need.columnInput&&input('columnInput',t('sheets.wi.columnInput'),12)}
  {need.rowInput&&input('rowInput',t('sheets.wi.rowInput'),12)}
  <Button variant="outline" size="compact" disabled={action.busy||!op} onClick={()=>op&&void action.run('sheets.whatif',op)} data-testid="sheets-wi-apply">{t('sheets.wi.apply')}</Button>
  <p className="text-ink-3">{t('sheets.wi.scope.'+(act==='goalSeek'?'goal':act.startsWith('table')?'table':act==='scenarioSummary'||act==='scenarioShow'||act==='scenarioDelete'?'name':'selection'),{range:selection})}</p>
  <p className="text-ink-3">{t('sheets.wi.hint')}</p>
 </div>;
}
/** Pictures and shapes in one grouped menu. A picture is read from a chosen PNG or JPEG file; shapes and object changes are built from fields. One undo step each. */
/** Merge, justify, rotate, double underline and clear formats in one grouped menu. One undo step each. */
type LayoutAction='mergeCells'|'mergeCenter'|'mergeAcross'|'unmerge'|'justify'|'rotNone'|'rotUp'|'rotDown'|'rotStacked'|'ulOn'|'ulOff'|'clear';
const LAYOUT_OPS:Record<LayoutAction,object>={mergeCells:{kind:'merge',how:'cells'},mergeCenter:{kind:'merge',how:'center'},mergeAcross:{kind:'merge',how:'across'},unmerge:{kind:'merge',how:'unmerge'},justify:{kind:'justify'},rotNone:{kind:'rotate',mode:'none'},rotUp:{kind:'rotate',mode:'up'},rotDown:{kind:'rotate',mode:'down'},rotStacked:{kind:'rotate',mode:'stacked'},ulOn:{kind:'doubleUnderline',on:true},ulOff:{kind:'doubleUnderline',on:false},clear:{kind:'clearFormats'}};
function CellLayoutGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [act,setAct]=useState<LayoutAction>('mergeCells');
 const r=s?.range;if(!s||!r)return null;
 const op=LAYOUT_OPS[act] as Parameters<typeof layoutBlockProblem>[0],problem=layoutBlockProblem(op,r.r1-r.r0+1,r.c1-r.c0+1);
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.cl.title')}>
  <span>{t('sheets.cl.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.cl.action')}<NativeSelect className={field} value={act} disabled={action.busy} onChange={e=>setAct(e.currentTarget.value as LayoutAction)} data-testid="sheets-cl-action">
   <optgroup label={t('sheets.cl.groupMerge')}>{(['mergeCells','mergeCenter','mergeAcross','unmerge'] as LayoutAction[]).map(a=><option key={a} value={a}>{t('sheets.cl.'+a)}</option>)}</optgroup>
   <optgroup label={t('sheets.cl.groupText')}>{(['justify','rotNone','rotUp','rotDown','rotStacked','ulOn','ulOff'] as LayoutAction[]).map(a=><option key={a} value={a}>{t('sheets.cl.'+a)}</option>)}</optgroup>
   <optgroup label={t('sheets.cl.groupClear')}><option value="clear">{t('sheets.cl.clear')}</option></optgroup>
  </NativeSelect></label>
  <Button variant="outline" size="compact" disabled={action.busy||!!problem} onClick={()=>void action.run('sheets.cellLayout',LAYOUT_OPS[act])} data-testid="sheets-cl-apply">{t('sheets.cl.apply')}</Button>
  <p className="text-ink-3">{t(problem==='two'?'sheets.cl.needTwo':'sheets.cl.hint',{range:rangeAddress(r)})}</p>
 </div>;
}
/** Cell styles, AutoSum, checkboxes and the format painter in one grouped menu. One undo step each. */
function CellToolsGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [choice,setChoice]=useState('style:Good');const [styleName,setStyleName]=useState('');
 const r=s?.range;if(!s||!r)return null;
 const saving=choice==='newStyle',savedName=cleanStyleName(styleName),custom=s.customStyles??[];
 const op=saving?(savedName?{kind:'newStyle' as const,name:savedName}:null):toolFromChoice(choice),rows=r.r1-r.r0+1,cols=r.c1-r.c0+1,problem=op?cellToolProblem(op,rows,cols):'cells';
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.ct.title')}>
  <span>{t('sheets.ct.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.ct.action')}<NativeSelect className={field} value={choice} disabled={action.busy} onChange={e=>setChoice(e.currentTarget.value)} data-testid="sheets-ct-action">
   <optgroup label={t('sheets.ct.groupStyles')}>{Object.values(CELL_STYLE_GROUPS).flat().map(n=><option key={n} value={'style:'+n}>{t('sheets.ct.style.'+n)}</option>)}</optgroup>
   {custom.length>0&&<optgroup label={t('sheets.ct.groupCustom')}>{custom.map(n=><option key={n} value={'custom:'+n}>{n}</option>)}</optgroup>}
   <optgroup label={t('sheets.ct.groupSave')}><option value="newStyle">{t('sheets.ct.newStyle')}</option></optgroup>
   <optgroup label={t('sheets.ct.groupSum')}>{AUTOSUM_FUNCTIONS.map(f=><option key={f} value={'sum:'+f}>{t('sheets.ct.sum.'+f)}</option>)}</optgroup>
   <optgroup label={t('sheets.ct.groupCheckbox')}>{(['insertCheckbox','toggleCheckbox'] as const).map(k=><option key={k} value={k}>{t('sheets.ct.'+k)}</option>)}</optgroup>
   <optgroup label={t('sheets.ct.groupPainter')}>{(['pickFormat','pasteFormat'] as const).map(k=><option key={k} value={k}>{t('sheets.ct.'+k)}</option>)}</optgroup>
  </NativeSelect></label>
  {saving&&<label className="flex flex-col gap-1">{t('sheets.ct.styleName')}<NativeInput className={field} value={styleName} maxLength={60} aria-invalid={!savedName} onChange={e=>setStyleName(e.currentTarget.value)} data-testid="sheets-ct-style-name"/></label>}
  <Button variant="outline" size="compact" disabled={action.busy||!op||!!problem} onClick={()=>void action.run('sheets.cellTools',op)} data-testid="sheets-ct-apply">{t('sheets.ct.apply')}</Button>
  <p className="text-ink-3">{t(problem==='many'?'sheets.ct.many':saving?'sheets.ct.saveHint':'sheets.ct.hint',{range:rangeAddress(r)})}</p>
  {action.notice?<p role="alert">{action.notice}</p>:null}
 </div>;
}
/** Rename or delete a saved style. Cells that already wear it keep their look. One undo step. */
function SavedStylesGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [pick,setPick]=useState(''),[act,setAct]=useState<'rename'|'delete'>('rename'),[to,setTo]=useState('');
 const custom=s?.customStyles??[];if(!s||custom.length===0)return null;
 const name=custom.includes(pick)?pick:custom[0],target=cleanStyleName(to),renaming=act==='rename';
 const op=renaming?(target&&target!==name?{kind:'renameStyle' as const,name,newName:target}:null):{kind:'deleteStyle' as const,name};
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.ms.title')}>
  <span>{t('sheets.ms.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.ms.style')}<NativeSelect className={field} value={name} disabled={action.busy} onChange={e=>setPick(e.currentTarget.value)} data-testid="sheets-ms-style">{custom.map(n=><option key={n} value={n}>{n}</option>)}</NativeSelect></label>
  <label className="flex flex-col gap-1">{t('sheets.ms.action')}<NativeSelect className={field} value={act} disabled={action.busy} onChange={e=>setAct(e.currentTarget.value as 'rename'|'delete')} data-testid="sheets-ms-action"><option value="rename">{t('sheets.ms.rename')}</option><option value="delete">{t('sheets.ms.delete')}</option></NativeSelect></label>
  {renaming&&<label className="flex flex-col gap-1">{t('sheets.ms.newName')}<NativeInput className={field} value={to} maxLength={60} aria-invalid={!!to&&!target} onChange={e=>setTo(e.currentTarget.value)} data-testid="sheets-ms-name"/></label>}
  <Button variant="outline" size="compact" disabled={action.busy||!op} onClick={()=>void action.run('sheets.cellTools',op).then(()=>setTo(''))} data-testid="sheets-ms-apply">{t('sheets.ms.apply')}</Button>
  <p className="text-ink-3">{t('sheets.ms.hint')}</p>
  {action.notice?<p role="alert">{action.notice}</p>:null}
 </div>;
}
/** Flash Fill and Consolidate in one grouped menu. One undo step each; Consolidate never overwrites filled cells. */
function DataToolsGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [act,setAct]=useState<'flashFill'|'consolidate'>('flashFill');
 const [func,setFunc]=useState<typeof CONSOLIDATE_FUNCTIONS[number]>('sum');const [sources,setSources]=useState('');const [top,setTop]=useState(false);const [left,setLeft]=useState(false);
 const r=s?.range;if(!s||!r)return null;
 const list=parseSourceList(sources),consolidating=act==='consolidate',needLeft=!consolidating&&dataToolProblem({kind:'flashFill'},r.c0)==='left';
 const problem=consolidating?(list?null:'sources'):needLeft?'left':null;
 const op=consolidating&&list?{kind:'consolidate',function:func,sources:list,topRow:top,leftColumn:left}:{kind:'flashFill'};
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.dt.title')}>
  <span>{t('sheets.dt.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.dt.action')}<NativeSelect className={field} value={act} disabled={action.busy} onChange={e=>setAct(e.currentTarget.value as 'flashFill'|'consolidate')} data-testid="sheets-dt-action">
   <optgroup label={t('sheets.dt.flashFill')}><option value="flashFill">{t('sheets.dt.flashFill')}</option></optgroup>
   <optgroup label={t('sheets.dt.consolidate')}><option value="consolidate">{t('sheets.dt.consolidate')}</option></optgroup>
  </NativeSelect></label>
  {consolidating&&<>
   <label className="flex flex-col gap-1">{t('sheets.dt.function')}<NativeSelect className={field} value={func} disabled={action.busy} onChange={e=>setFunc(e.currentTarget.value as typeof func)} data-testid="sheets-dt-function">{CONSOLIDATE_FUNCTIONS.map(f=><option key={f} value={f}>{t('sheets.dt.fn.'+f)}</option>)}</NativeSelect></label>
   <label className="flex flex-col gap-1">{t('sheets.dt.sources')}<NativeInput className={field} value={sources} maxLength={1000} aria-invalid={sources.trim()!==''&&!list} disabled={action.busy} onChange={e=>setSources(e.currentTarget.value)} data-testid="sheets-dt-sources"/></label>
   <Checkbox label={t('sheets.dt.topRow')} checked={top} disabled={action.busy} onChange={e=>setTop(e.currentTarget.checked)}/>
   <Checkbox label={t('sheets.dt.leftColumn')} checked={left} disabled={action.busy} onChange={e=>setLeft(e.currentTarget.checked)}/>
  </>}
  <Button variant="outline" size="compact" disabled={action.busy||!!problem} onClick={()=>void action.run('sheets.dataTools',op)} data-testid="sheets-dt-apply">{t('sheets.dt.apply')}</Button>
  <p className="text-ink-3">{t(needLeft?'sheets.dt.needLeft':problem==='sources'?'sheets.dt.badSources':consolidating?'sheets.dt.hintConsolidate':'sheets.dt.hintFlash',{range:rangeAddress(r)})}</p>
  {action.notice?<p role="alert">{action.notice}</p>:null}
 </div>;
}
/** Insert Function: pick from the engine's library; the formula starts in the cell editor and the person finishes it. */
function InsertFunctionGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [category,setCategory]=useState('');const [search,setSearch]=useState('');const [pick,setPick]=useState('');
 const all=s?.functions??[];if(!s||all.length===0)return null;
 const list=filterFunctions(all,category,search),chosen=list.find(f=>f.name===pick)??list[0]??null;
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.fn.title')}>
  <span>{t('sheets.fn.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.fn.search')}<NativeInput className={field} value={search} maxLength={64} onChange={e=>setSearch(e.currentTarget.value)} data-testid="sheets-fn-search"/></label>
  <label className="flex flex-col gap-1">{t('sheets.fn.category')}<NativeSelect className={field} value={category} onChange={e=>setCategory(e.currentTarget.value)} data-testid="sheets-fn-category">
   <option value="">{t('sheets.fn.all')}</option>{functionCategories(all).map(c=><option key={c} value={c}>{c}</option>)}
  </NativeSelect></label>
  <label className="flex flex-col gap-1">{t('sheets.fn.function')}<NativeSelect className={field} value={chosen?.name??''} disabled={!chosen} onChange={e=>setPick(e.currentTarget.value)} data-testid="sheets-fn-pick">
   {list.map(f=><option key={f.name} value={f.name}>{f.name}</option>)}
  </NativeSelect></label>
  {chosen?<p className="break-words text-ink-3"><span className="font-semibold">{chosen.signature}</span> {chosen.description}</p>:<p className="text-ink-3">{t('sheets.fn.none')}</p>}
  <Button variant="outline" size="compact" disabled={action.busy||!chosen} onClick={()=>void action.run('sheets.insertFunction',{name:chosen?.name})} data-testid="sheets-fn-insert">{t('sheets.fn.insert')}</Button>
  <p className="text-ink-3">{t('sheets.fn.hint')}</p>
  {action.notice?<p role="alert">{action.notice}</p>:null}
 </div>;
}
/** Sheet tab: hide this sheet, show a hidden one, or set the tab color. One undo step each. */
type TabAction='hide'|'unhide'|'color'|'noColor';
function SheetTabGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [act,setAct]=useState<TabAction>('color');const [pick,setPick]=useState('');const [color,setColor]=useState<string>(TAB_COLORS[4][1]);
 if(!s)return null;
 const list=s.workbook?.sheets??[],hidden=list.filter(x=>x.visibility==='Hidden'),visible=list.filter(x=>x.visibility==='Visible').length;
 const chosen=hidden.find(x=>String(x.index)===pick)??hidden[0]??null,current=safeTabColor(list.find(x=>x.index===s.sheet)?.tabColor);
 const ok=act==='hide'?visible>1:act==='unhide'?!!chosen:true;
 const apply=()=>{if(!ok)return;void action.run('sheets.sheet',act==='hide'?{kind:'hide'}:act==='unhide'?{kind:'unhide',index:chosen?.index}:act==='color'?{kind:'tabColor',color}:{kind:'tabColor',color:'none'});};
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.tab.title')}>
  <span>{t('sheets.tab.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.tab.action')}<NativeSelect className={field} value={act} disabled={action.busy} onChange={e=>setAct(e.currentTarget.value as TabAction)} data-testid="sheets-tab-action">
   <optgroup label={t('sheets.tab.groupVisibility')}><option value="hide">{t('sheets.tab.hide')}</option><option value="unhide">{t('sheets.tab.unhide')}</option></optgroup>
   <optgroup label={t('sheets.tab.groupColor')}><option value="color">{t('sheets.tab.color')}</option><option value="noColor">{t('sheets.tab.noColor')}</option></optgroup>
  </NativeSelect></label>
  {act==='unhide'&&<label className="flex flex-col gap-1">{t('sheets.tab.pick')}<NativeSelect className={field} value={chosen?String(chosen.index):''} disabled={action.busy||hidden.length===0} onChange={e=>setPick(e.currentTarget.value)} data-testid="sheets-tab-pick">{hidden.length===0?<option value="">{t('sheets.tab.none')}</option>:hidden.map(x=><option key={x.index} value={String(x.index)}>{x.name}</option>)}</NativeSelect></label>}
  {act==='color'&&<label className="flex flex-col gap-1">{t('sheets.tab.palette')}<NativeSelect className={field} value={color} disabled={action.busy} onChange={e=>setColor(e.currentTarget.value)} data-testid="sheets-tab-palette">{TAB_COLORS.map(([k,hex])=><option key={k} value={hex}>{t('sheets.tab.c.'+k)}</option>)}</NativeSelect></label>}
  <Button variant="outline" size="compact" disabled={action.busy||!ok} onClick={apply} data-testid="sheets-tab-apply">{t('sheets.tab.apply')}</Button>
  <p className="text-ink-3">{t(current?'sheets.tab.hasColor':'sheets.tab.noColorYet',{sheet:s.sheetName})}</p>
 </div>;
}
/** Outline: group, collapse or expand the selected lines, or insert subtotals under every run of equal values. One undo step each. */
type OutlineAction='group'|'ungroup'|'hide'|'show'|'subtotal';
function OutlineGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [act,setAct]=useState<OutlineAction>('group');const [axis,setAxis]=useState<'rows'|'cols'>('rows');const [by,setBy]=useState('');const [fn,setFn]=useState<SubtotalFunc>('sum');const [values,setValues]=useState('');
 const r=s?.range;if(!s||!r)return null;
 const sub=act==='subtotal',rows=r.r1-r.r0+1,letters=Array.from({length:Math.min(r.c1-r.c0+1,200)},(_,i)=>colName(r.c0+i));
 const groupBy=by&&letters.includes(by)?by:letters[0]??'',cols=parseColumnList(values);
 const inside=!!cols&&cols.every(c=>letters.includes(c)),ok=sub?rows>=3&&rows<=MAX_SUBTOTAL_ROWS&&inside:true;
 const apply=()=>{if(ok)void action.run('sheets.outline',sub?{kind:'subtotal',groupBy,function:fn,columns:cols}:{kind:act,axis});};
 const info=s.outline;
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.ol.title')}>
  <span>{t('sheets.ol.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.ol.action')}<NativeSelect className={field} value={act} disabled={action.busy} onChange={e=>setAct(e.currentTarget.value as OutlineAction)} data-testid="sheets-ol-action">
   <optgroup label={t('sheets.ol.groupLines')}><option value="group">{t('sheets.ol.group')}</option><option value="ungroup">{t('sheets.ol.ungroup')}</option></optgroup>
   <optgroup label={t('sheets.ol.groupDetail')}><option value="hide">{t('sheets.ol.hide')}</option><option value="show">{t('sheets.ol.show')}</option></optgroup>
   <optgroup label={t('sheets.ol.groupTotals')}><option value="subtotal">{t('sheets.ol.subtotal')}</option></optgroup>
  </NativeSelect></label>
  {!sub&&<label className="flex flex-col gap-1">{t('sheets.ol.axis')}<NativeSelect className={field} value={axis} disabled={action.busy} onChange={e=>setAxis(e.currentTarget.value as 'rows'|'cols')} data-testid="sheets-ol-axis"><option value="rows">{t('sheets.ol.rows')}</option><option value="cols">{t('sheets.ol.cols')}</option></NativeSelect></label>}
  {sub&&<label className="flex flex-col gap-1">{t('sheets.ol.by')}<NativeSelect className={field} value={groupBy} disabled={action.busy} onChange={e=>setBy(e.currentTarget.value)} data-testid="sheets-ol-by">{letters.map(l=><option key={l} value={l}>{l}</option>)}</NativeSelect></label>}
  {sub&&<label className="flex flex-col gap-1">{t('sheets.ol.func')}<NativeSelect className={field} value={fn} disabled={action.busy} onChange={e=>setFn(e.currentTarget.value as SubtotalFunc)} data-testid="sheets-ol-func">{SUBTOTAL_FUNCS.map(f=><option key={f} value={f}>{t('sheets.ol.f.'+f)}</option>)}</NativeSelect></label>}
  {sub&&<label className="flex flex-col gap-1">{t('sheets.ol.values')}<NativeInput className={field} value={values} maxLength={40} aria-invalid={values!==''&&!inside} disabled={action.busy} onChange={e=>setValues(e.currentTarget.value)} data-testid="sheets-ol-values"/></label>}
  <Button variant="outline" size="compact" disabled={action.busy||!ok} onClick={apply} data-testid="sheets-ol-apply">{t('sheets.ol.apply')}</Button>
  <p className="text-ink-3">{t(sub?'sheets.ol.subHint':'sheets.ol.hint',{range:rangeAddress(r)})}</p>
  {info&&(info.rows.lines>0||info.cols.lines>0)&&<p className="text-ink-3" data-testid="sheets-ol-info">{t('sheets.ol.info',{rows:info.rows.lines,cols:info.cols.lines,hidden:info.rows.hidden+info.cols.hidden})}</p>}
 </div>;
}
/** Named views: the sheet, the selected cell and the zoom. Saving and deleting are workbook settings, not undo steps. */
type ViewsAction='save'|'show'|'delete';
function SavedViewsGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [act,setAct]=useState<ViewsAction>('show');const [name,setName]=useState('');const [pick,setPick]=useState('');
 if(!s)return null;
 const list=s.savedViews??[],saving=act==='save',chosen=list.find(v=>v.name===pick)??null,target=saving?name.trim():chosen?.name??'';
 const problem=saving?viewNameProblem(name):chosen?'':'pick';
 const apply=()=>{if(!problem)void action.run('sheets.savedView',{kind:act,name:target}).then(r=>{if(r!==null&&saving)setName('');});};
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.sv.title')}>
  <span>{t('sheets.sv.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.sv.action')}<NativeSelect className={field} value={act} disabled={action.busy} onChange={e=>setAct(e.currentTarget.value as ViewsAction)} data-testid="sheets-sv-action">
   <optgroup label={t('sheets.sv.groupCurrent')}><option value="save">{t('sheets.sv.save')}</option></optgroup>
   <optgroup label={t('sheets.sv.groupSaved')}><option value="show">{t('sheets.sv.show')}</option><option value="delete">{t('sheets.sv.delete')}</option></optgroup>
  </NativeSelect></label>
  {saving?<label className="flex flex-col gap-1">{t('sheets.sv.name')}<NativeInput className={field} value={name} maxLength={MAX_VIEW_NAME} aria-invalid={name!==''&&!!problem} disabled={action.busy} onChange={e=>setName(e.currentTarget.value)} data-testid="sheets-sv-name"/></label>
   :<label className="flex flex-col gap-1">{t('sheets.sv.pick')}<NativeSelect className={field} value={pick} disabled={action.busy} onChange={e=>setPick(e.currentTarget.value)} data-testid="sheets-sv-pick"><option value="">{t('sheets.sv.pickNone')}</option>{list.map(v=><option key={v.name} value={v.name}>{v.name} ({v.selection}, {v.zoom}%)</option>)}</NativeSelect></label>}
  <Button variant="outline" size="compact" disabled={action.busy||!!problem} onClick={apply} data-testid="sheets-sv-apply">{t('sheets.sv.apply')}</Button>
  <p className="text-ink-3">{t('sheets.sv.hint',{cell:s.address})}</p>
 </div>;
}
function ObjectsGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [act,setAct]=useState<ObjectAction>('picture');const [file,setFile]=useState<File|null>(null);const [alt,setAlt]=useState('');
 const [f,setF]=useState({fill:'',line:'',text:'',width:'',height:'',pick:''});const r=s?.range;
 if(!s||!r)return null;
 const shape=objectIsShape(act),pick=objectNeedsPick(act),sizing=shape||act==='resize'||act==='picture',at=(row:number,col:number)=>rangeAddress({r0:row,c0:col,r1:row,c1:col});
 const objects=[...(s.objects?.images??[]).map(i=>({key:'image:'+i.id,label:t('sheets.ob.imageName',{id:i.id,at:at(i.row,i.col)})})),...(s.objects?.shapes??[]).map(i=>({key:'shape:'+i.id,label:t('sheets.ob.shapeName',{id:i.id,at:at(i.row,i.col)})}))];
 const op=act==='picture'?null:buildObjectOp(act,f),width=f.width.trim()===''?0:Number(f.width.replace(/,/g,'.'));
 const pictureOk=act==='picture'&&!!file&&file.size>0&&file.size<=MAX_PICTURE_BYTES&&(f.width.trim()===''||(Number.isFinite(width)&&width>=16&&width<=2000));
 const run=async()=>{
  if(act!=='picture'){if(op)void action.run('sheets.object',op);return;}
  if(!file)return;
  const bytes=new Uint8Array(await file.arrayBuffer());
  const done=await action.run('sheets.picture',{base64:bytesToBase64(bytes),...(alt.trim()?{alt:alt.trim()}:{}),...(width?{width}:{})});
  if(done!==null){setFile(null);setAlt('');}
 };
 const input=(k:'width'|'height'|'text',label:string,max:number)=><label className="flex flex-col gap-1">{label}<NativeInput className={field} value={f[k]} maxLength={max} disabled={action.busy} onChange={e=>setF(x=>({...x,[k]:e.currentTarget.value}))} data-testid={'sheets-ob-'+k}/></label>;
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.ob.title')}>
  <span>{t('sheets.ob.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.ob.action')}<NativeSelect className={field} value={act} disabled={action.busy} onChange={e=>setAct(e.currentTarget.value as ObjectAction)} data-testid="sheets-ob-action">{OBJECT_GROUPS.map(([g,items])=><optgroup key={g} label={t('sheets.ob.group.'+g)}>{items.map(a=><option key={a} value={a}>{t('sheets.ob.act.'+a)}</option>)}</optgroup>)}</NativeSelect></label>
  {act==='picture'&&<label className="flex flex-col gap-1">{t('sheets.ob.file')}<NativeInput className={field} type="file" accept="image/png,image/jpeg" disabled={action.busy} onChange={e=>setFile(e.currentTarget.files?.[0]??null)} data-testid="sheets-ob-file"/></label>}
  {act==='picture'&&file&&file.size>MAX_PICTURE_BYTES&&<p role="alert" className="text-ink-3">{t('sheets.ob.tooBig')}</p>}
  {act==='picture'&&<label className="flex flex-col gap-1">{t('sheets.ob.alt')}<NativeInput className={field} value={alt} maxLength={MAX_ALT} disabled={action.busy} onChange={e=>setAlt(e.currentTarget.value)} data-testid="sheets-ob-alt"/></label>}
  {pick&&<label className="flex flex-col gap-1">{t('sheets.ob.pick')}<NativeSelect className={field} value={f.pick} disabled={action.busy} onChange={e=>setF(x=>({...x,pick:e.currentTarget.value}))} data-testid="sheets-ob-pick"><option value="">{t('sheets.ob.pickNone')}</option>{objects.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}</NativeSelect></label>}
  {shape&&<label className="flex flex-col gap-1">{t('sheets.ob.fill')}<NativeSelect className={field} value={f.fill} disabled={action.busy} onChange={e=>setF(x=>({...x,fill:e.currentTarget.value}))} data-testid="sheets-ob-fill"><option value="">{t('sheets.ob.default')}</option>{SHAPE_FILLS.map(c=><option key={c} value={c}>{t('sheets.ob.color.'+c)}</option>)}</NativeSelect></label>}
  {shape&&<label className="flex flex-col gap-1">{t('sheets.ob.line')}<NativeSelect className={field} value={f.line} disabled={action.busy} onChange={e=>setF(x=>({...x,line:e.currentTarget.value}))} data-testid="sheets-ob-line"><option value="">{t('sheets.ob.default')}</option>{SHAPE_LINES.map(c=><option key={c} value={c}>{t('sheets.ob.color.'+c)}</option>)}</NativeSelect></label>}
  {act==='textBox'&&input('text',t('sheets.ob.text'),MAX_SHAPE_TEXT)}
  {sizing&&input('width',t('sheets.ob.width'),8)}
  {(shape||act==='resize')&&input('height',t('sheets.ob.height'),8)}
  <Button variant="outline" size="compact" disabled={action.busy||(act==='picture'?!pictureOk:!op)} onClick={()=>void run()} data-testid="sheets-ob-apply">{t('sheets.ob.apply')}</Button>
  <p className="text-ink-3">{t(act==='picture'||shape?'sheets.ob.scopeAt':'sheets.ob.scopeObject',{range:rangeAddress({...r,r1:r.r0,c1:r.c0})})}</p>
 </div>;
}
/** Zoom (presets or a custom percentage, or fit to the selection) and gridlines in one grouped menu. Zoom is a view setting; gridlines are one undo step. */
type ViewAction='z50'|'z75'|'z100'|'z125'|'z150'|'z200'|'custom'|'fit'|'gridlinesOn'|'gridlinesOff'|'headingsOn'|'headingsOff'|'zerosOn'|'zerosOff'|'formulasOn'|'formulasOff';
function ViewGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [act,setAct]=useState<ViewAction>('z100');const [custom,setCustom]=useState(100);
 const layout=s?.layout;if(!s||!layout)return null;
 const apply=()=>{
  if(act==='fit')void action.run('sheets.view',{fit:'selection'});
  else if(act==='custom')void action.run('sheets.view',{zoom:custom});
  else if(act==='gridlinesOn'||act==='gridlinesOff')void action.run('sheets.view',{gridlines:act==='gridlinesOn'});
  else if(act==='headingsOn'||act==='headingsOff')void action.run('sheets.view',{headings:act==='headingsOn'});
  else if(act==='zerosOn'||act==='zerosOff')void action.run('sheets.view',{zeros:act==='zerosOn'});
  else if(act==='formulasOn'||act==='formulasOff')void action.run('sheets.view',{formulas:act==='formulasOn'});
  else void action.run('sheets.view',{zoom:Number(act.slice(1))});
 };
 const opt=(id:ViewAction)=><option key={id} value={id}>{t('sheets.vw.'+id)}</option>;
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.vw.title')}>
  <span>{t('sheets.vw.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.vw.action')}<NativeSelect className={field} value={act} disabled={action.busy} onChange={e=>setAct(e.currentTarget.value as ViewAction)} data-testid="sheets-vw-action">
   <optgroup label={t('sheets.vw.groupZoom')}>{(['z50','z75','z100','z125','z150','z200','custom','fit'] as ViewAction[]).map(opt)}</optgroup>
   <optgroup label={t('sheets.vw.groupShow')}>{(['gridlinesOn','gridlinesOff','headingsOn','headingsOff','zerosOn','zerosOff','formulasOn','formulasOff'] as ViewAction[]).map(opt)}</optgroup>
  </NativeSelect></label>
  {act==='custom'&&<NumberField label={t('sheets.vw.zoomLabel')} unit="%" value={custom} resetKey="view-zoom" min={MIN_ZOOM} max={MAX_ZOOM} step={5} disabled={action.busy} constraintError={t('sheets.vw.zoomInvalid')} parse={v=>{const n=Number(v.trim());return v.trim()&&Number.isInteger(n)&&n>=MIN_ZOOM&&n<=MAX_ZOOM?{ok:true,value:n}:{ok:false,error:t('sheets.vw.zoomInvalid')};}} onCommit={v=>setCustom(v)}/>}
  <Button variant="outline" size="compact" disabled={action.busy} onClick={apply} data-testid="sheets-vw-apply">{t('sheets.vw.apply')}</Button>
  <Button variant="outline" size="compact" onClick={()=>void action.run('sheets.shortcuts',{})} data-testid="sheets-vw-shortcuts">{t('sheets.sc.button')}</Button>
  <p className="text-ink-3">{t('sheets.vw.current',{zoom:layout.zoom??100,state:t(layout.showGridlines?'sheets.vw.on':'sheets.vw.off')})} {t('sheets.vw.current2',{headings:t(layout.showHeadings===false?'sheets.vw.off':'sheets.vw.on'),zeros:t(layout.showZeros===false?'sheets.vw.off':'sheets.vw.on')})} {t('sheets.vw.current3',{state:t(layout.showFormulas?'sheets.vw.on':'sheets.vw.off')})}</p>
 </div>;
}
/** Page setup and export in one grouped menu: page, print area and titles, appearance, header and footer, and file export. One undo step per change. */
type PrintAction='portrait'|'landscape'|'paperA4'|'paperA3'|'paperLetter'|'paperLegal'|'marginsNormal'|'marginsWide'|'marginsNarrow'|'fitWidth'|'scale'|'areaSet'|'areaClear'|'rowBreakAdd'|'rowBreakRemove'|'colBreakAdd'|'colBreakRemove'|'breaksClear'|'titleRowsSet'|'titleRowsClear'|'titleColsSet'|'titleColsClear'|'areaGo'|'gridlinesOn'|'gridlinesOff'|'headingsOn'|'headingsOff'|'centerOn'|'centerOff'|'header'|'footer'|'pdfSheet'|'pdfAll'|'pdfSelection'|'csv'|'tsv'|'html';
const PRINT_EXPORTS:Record<string,{format:'pdf'|'csv'|'tsv'|'html';scope:'sheet'|'all'|'selection'}>={pdfSheet:{format:'pdf',scope:'sheet'},pdfAll:{format:'pdf',scope:'all'},pdfSelection:{format:'pdf',scope:'selection'},csv:{format:'csv',scope:'sheet'},tsv:{format:'tsv',scope:'sheet'},html:{format:'html',scope:'sheet'}};
function PrintGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [act,setAct]=useState<PrintAction>('pdfSheet');const [scale,setScale]=useState(100);const [text,setText]=useState('');
 const r=s?.range;if(!s||!r)return null;
 const exporting=act in PRINT_EXPORTS,page=s.page??null,isText=act==='header'||act==='footer',textBad=isText&&headerProblem(text);
 const hf=isText?previewHeaderFooter(text,{page:1,pages:Math.max(1,s.pageList?.total??1),sheet:s.sheetName,file:s.file,date:new Date().toISOString().slice(0,10),time:new Date().toTimeString().slice(0,5)}):null;
 const breakAt=act==='rowBreakAdd'||act==='rowBreakRemove'?r.r0+1:act==='colBreakAdd'||act==='colBreakRemove'?r.c0+1:0,breakBad=(act==='rowBreakAdd'||act==='colBreakAdd')&&breakAt<2,breakNone=act==='rowBreakRemove'?!page?.rowBreaks.includes(breakAt):act==='colBreakRemove'?!page?.colBreaks.includes(breakAt):act==='breaksClear'?!page||(page.rowBreaks.length+page.colBreaks.length===0):false;
 const apply=()=>{
  const e=PRINT_EXPORTS[act];if(e){void action.run('sheets.export',e);return;}
  if(act==='areaGo'){if(page?.printArea)void action.run('sheets.navigate',{sheet:s.sheet,address:page.printArea});return;}
  const rows=`${r.r0+1}:${r.r1+1}`;
  const ops:Record<string,unknown>={portrait:{orientation:'portrait'},landscape:{orientation:'landscape'},paperA4:{paper:'A4'},paperA3:{paper:'A3'},paperLetter:{paper:'Letter'},paperLegal:{paper:'Legal'},marginsNormal:{margins:'normal'},marginsWide:{margins:'wide'},marginsNarrow:{margins:'narrow'},fitWidth:{fitWidth:1,fitHeight:0},scale:{scale},areaSet:{printArea:rangeAddress(r)},rowBreakAdd:{addRowBreak:r.r0+1},rowBreakRemove:{removeRowBreak:r.r0+1},colBreakAdd:{addColBreak:r.c0+1},colBreakRemove:{removeColBreak:r.c0+1},breaksClear:{clearBreaks:true},areaClear:{printArea:null},titleRowsSet:{titleRows:rows},titleRowsClear:{titleRows:null},titleColsSet:{titleCols:`${colName(r.c0)}:${colName(r.c1)}`},titleColsClear:{titleCols:null},gridlinesOn:{gridlines:true},gridlinesOff:{gridlines:false},headingsOn:{headings:true},headingsOff:{headings:false},centerOn:{centerH:true,centerV:false},centerOff:{centerH:false,centerV:false},header:{header:text},footer:{footer:text}};
  void action.run('sheets.pageSetup',ops[act]);
 };
 const opt=(id:PrintAction)=><option key={id} value={id}>{t('sheets.pr.'+id)}</option>;
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.pr.title')}>
  <span>{t('sheets.pr.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.pr.action')}<NativeSelect className={field} value={act} disabled={action.busy} onChange={e=>setAct(e.currentTarget.value as PrintAction)} data-testid="sheets-pr-action">
   <optgroup label={t('sheets.pr.groupExport')}>{(['pdfSheet','pdfAll','pdfSelection','csv','tsv','html'] as PrintAction[]).map(opt)}</optgroup>
   <optgroup label={t('sheets.pr.groupPage')}>{(['portrait','landscape','paperA4','paperA3','paperLetter','paperLegal','marginsNormal','marginsWide','marginsNarrow','fitWidth','scale'] as PrintAction[]).map(opt)}</optgroup>
   <optgroup label={t('sheets.pr.groupArea')}>{(['areaSet','areaGo','areaClear','titleRowsSet','titleRowsClear','titleColsSet','titleColsClear'] as PrintAction[]).map(opt)}</optgroup>
   <optgroup label={t('sheets.pr.groupBreaks')}>{(['rowBreakAdd','rowBreakRemove','colBreakAdd','colBreakRemove','breaksClear'] as PrintAction[]).map(opt)}</optgroup>
   <optgroup label={t('sheets.pr.groupLook')}>{(['gridlinesOn','gridlinesOff','headingsOn','headingsOff','centerOn','centerOff'] as PrintAction[]).map(opt)}</optgroup>
   <optgroup label={t('sheets.pr.groupText')}>{(['header','footer'] as PrintAction[]).map(opt)}</optgroup>
  </NativeSelect></label>
  {act==='scale'&&<NumberField label={t('sheets.pr.scaleLabel')} unit="%" value={scale} resetKey="print-scale" min={10} max={400} step={5} disabled={action.busy} constraintError={t('sheets.pr.scaleInvalid')} parse={v=>{const n=Number(v.trim());return v.trim()&&Number.isInteger(n)&&n>=10&&n<=400?{ok:true,value:n}:{ok:false,error:t('sheets.pr.scaleInvalid')};}} onCommit={v=>{if(v!==null)setScale(v);}}/>}
  {isText&&<label className="flex flex-col gap-1">{t('sheets.pr.text')}<NativeInput className={field} value={text} maxLength={MAX_HEADER_CHARS} aria-invalid={textBad} disabled={action.busy} onChange={e=>setText(e.currentTarget.value)} data-testid="sheets-pr-text"/></label>}
  {isText&&<label className="flex flex-col gap-1">{t('sheets.pr.insertCode')}<NativeSelect className={field} value="" disabled={action.busy} onChange={e=>{const code=e.currentTarget.value as typeof HF_CODES[number];const next=code?appendHeaderCode(text,code):null;if(next!==null)setText(next);}} data-testid="sheets-pr-code">
   <option value="">{t('sheets.pr.insertCodeNone')}</option>
   <optgroup label={t('sheets.pr.codePlace')}>{(['L','C','R'] as const).map(c=><option key={c} value={c}>{t('sheets.pr.code.'+c)}</option>)}</optgroup>
   <optgroup label={t('sheets.pr.codeValue')}>{(['P','N','D','T','A','F','&'] as const).map(c=><option key={c} value={c}>{t('sheets.pr.code.'+(c==='&'?'amp':c))}</option>)}</optgroup>
  </NativeSelect></label>}
  {isText&&<p className="text-ink-3">{t('sheets.pr.hint')}</p>}
  {isText&&!textBad&&text!==''&&hf&&<p className="text-ink-3" data-testid="sheets-pr-preview">{t('sheets.pr.preview',{left:hf[0]||'-',center:hf[1]||'-',right:hf[2]||'-'})}</p>}
  <Button variant="outline" size="compact" disabled={action.busy||textBad||breakBad||breakNone||(act==='areaGo'&&!page?.printArea)} onClick={apply} data-testid="sheets-pr-apply">{t(exporting?'sheets.pr.applyExport':'sheets.pr.apply')}</Button>
  {page&&<p className="text-ink-3">{page.fitWidth>0?t('sheets.pr.currentFit',{orientation:t('sheets.pr.'+page.orientation),paper:page.paper,w:page.fitWidth}):t('sheets.pr.current',{orientation:t('sheets.pr.'+page.orientation),paper:page.paper,scale:page.scale})}</p>}
  {page&&(page.printArea||page.titleRows||page.titleCols)&&<p className="text-ink-3" data-testid="sheets-pr-area-now">{t('sheets.pr.areaNow',{area:page.printArea??'-',rows:page.titleRows??'-',cols:page.titleCols??'-'})}</p>}
  {(breakBad||breakNone)&&<p className="text-ink-3">{t(breakBad?'sheets.pr.breakFirst':'sheets.pr.breakNone')}</p>}
  {page&&(page.rowBreaks.length>0||page.colBreaks.length>0)&&<p className="text-ink-3">{t('sheets.pr.breaksNow',{rows:page.rowBreaks.join(', ')||'-',cols:page.colBreaks.join(', ')||'-'})}</p>}
  <p className="text-ink-3">{t('sheets.pr.scope',{range:rangeAddress(r)})}</p>
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
/** Edit an existing PivotTable of this sheet in one grouped menu. One undo step each; a report never overwrites other data. */
type PivotAct='addField'|'removeField'|'moveField'|'valueFunc'|'valueShowAs'|'valueFormat'|'filterItems'|'filterAll'|'sort'|'group'|'collapse'|'expand'|'layout'|'totals'|'subtotals'|'headers'|'style'|'useSelection'|'refresh'|'delete'|'goReport'|'goSource';
const PIVOT_ACTS:[string,PivotAct[]][]=[['groupFields',['addField','removeField','moveField']],['groupValues',['valueFunc','valueShowAs','valueFormat']],['groupItems',['filterItems','filterAll','sort','group','collapse','expand']],['groupLayout',['layout','totals','subtotals','headers','style']],['groupReport',['goReport','goSource','useSelection','refresh','delete']]];
function PivotEditGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();
 const [pick,setPick]=useState('');const [act,setAct]=useState<PivotAct>('addField');const [fieldPick,setFieldPick]=useState('');const [area,setArea]=useState<PivotArea>('rows');const [to,setTo]=useState<PivotArea>('columns');
 const [func,setFunc]=useState<PivotValueFunc>('sum');const [showAs,setShowAs]=useState<typeof PIVOT_SHOW_AS[number]>('normal');const [fmt,setFmt]=useState('');const [vi,setVi]=useState(0);
 const [order,setOrder]=useState<typeof PIVOT_ORDERS[number]>('asc');const [by,setBy]=useState<typeof PIVOT_GROUPS[number]>('years');const [layout,setLayout]=useState<typeof PIVOT_LAYOUTS[number]>('compact');
 const [totals,setTotals]=useState('both');const [subs,setSubs]=useState<typeof PIVOT_SUBTOTALS[number]>('bottom');const [heads,setHeads]=useState('show');const [style,setStyle]=useState<string>(PIVOT_STYLES[0]);const [items,setItems]=useState('');
 const r=s?.range,list=s?.pivots??[],p=list.find(x=>x.name===pick)??list[0]??null;
 if(!s||!r||!p)return null;
 const names=(xs:{field:string}[])=>xs.map(x=>x.field),axis=[...new Set([...names(p.rows),...names(p.columns),...names(p.filters)])];
 const fieldActs:PivotAct[]=['filterItems','filterAll','sort','collapse','expand'];
 const fieldList=act==='addField'?p.fields.map(f=>f.name):act==='removeField'||act==='moveField'?names(p[area]):act==='group'?p.fields.filter(f=>f.date).map(f=>f.name):fieldActs.includes(act)?axis:[];
 const usesField=act==='addField'||act==='removeField'||act==='moveField'||act==='group'||fieldActs.includes(act),chosen=fieldList.includes(fieldPick)?fieldPick:fieldList[0]??'';
 const valueActs=act==='valueFunc'||act==='valueShowAs'||act==='valueFormat',idx=Math.min(vi,Math.max(0,p.values.length-1));
 const itemList=items.split(';').map(x=>x.trim()).filter(Boolean),rows=r.r1-r.r0+1,cols=r.c1-r.c0+1;
 const build=():PivotEditOp|null=>{
  const pivot=p.name;
  switch(act){
   case 'addField':return chosen?{kind:'addField',pivot,field:chosen,area,...(area==='values'?{func}:{})}:null;
   case 'removeField':return chosen?{kind:'removeField',pivot,field:chosen,area}:null;
   case 'moveField':return chosen&&area!==to?{kind:'moveField',pivot,field:chosen,from:area,to}:null;
   case 'valueFunc':return p.values.length?{kind:'valueSettings',pivot,index:idx,func}:null;
   case 'valueShowAs':return p.values.length?{kind:'valueSettings',pivot,index:idx,showAs}:null;
   case 'valueFormat':return p.values.length?{kind:'valueSettings',pivot,index:idx,numberFormat:fmt===''?null:fmt}:null;
   case 'filterItems':return chosen&&itemList.length>0&&itemList.length<=MAX_PIVOT_ITEMS?{kind:'filter',pivot,field:chosen,selected:itemList}:null;
   case 'filterAll':return chosen?{kind:'filter',pivot,field:chosen,selected:null}:null;
   case 'sort':return chosen?{kind:'sort',pivot,field:chosen,order}:null;
   case 'group':return chosen?{kind:'group',pivot,field:chosen,by}:null;
   case 'collapse':case 'expand':return chosen?{kind:'collapse',pivot,field:chosen,collapse:act==='collapse'}:null;
   case 'layout':return {kind:'layout',pivot,layout};
   case 'totals':return {kind:'layout',pivot,grandTotalsRows:totals==='both'||totals==='rows',grandTotalsCols:totals==='both'||totals==='cols'};
   case 'subtotals':return {kind:'layout',pivot,subtotals:subs};
   case 'headers':return {kind:'layout',pivot,showHeaders:heads==='show'};
   case 'style':return {kind:'layout',pivot,style};
   case 'goReport':case 'goSource':return null;
   case 'useSelection':return pivotSourceProblem(rows,cols)?null:{kind:'changeSource',pivot};
   default:return {kind:act,pivot};
  }
 };
 const op=build();
 const place=(()=>{if(act==='goReport')return p.range?{sheet:s.sheet,address:p.range}:null;if(act!=='goSource'||!p.source)return null;
  const named=nameTarget(p.source),found=named?(s.workbook?.sheets??[]).find(x=>x.name.toLowerCase()===named.sheet.toLowerCase()&&x.visibility==='Visible'):undefined,span=nameSpan(p.source.includes('!')?p.source:'=X!'+p.source);
  return found&&span?{sheet:found.index,address:span}:!p.source.includes('!')&&span?{sheet:s.sheet,address:span}:null;})();
 const going=act==='goReport'||act==='goSource';
 const sel=<T extends string>(label:string,value:T,set:(v:T)=>void,options:{value:string;text:string}[],id:string)=><label className="flex flex-col gap-1">{label}<NativeSelect className={field} value={value} disabled={action.busy||options.length===0} onChange={e=>set(e.currentTarget.value as T)} data-testid={id}>{options.map(o=><option key={o.value} value={o.value}>{o.text}</option>)}</NativeSelect></label>;
 const areaOpts=PIVOT_AREAS.map(a=>({value:a,text:t('sheets.pe.area.'+a)}));
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.pe.title')}>
  <span>{t('sheets.pe.title')}</span>
  {sel(t('sheets.pe.pivot'),p.name,setPick,list.map(x=>({value:x.name,text:x.name+(x.range?' '+x.range:'')})),'sheets-pe-pivot')}
  <label className="flex flex-col gap-1">{t('sheets.pe.action')}<NativeSelect className={field} value={act} disabled={action.busy} onChange={e=>setAct(e.currentTarget.value as PivotAct)} data-testid="sheets-pe-action">
   {PIVOT_ACTS.map(([group,acts])=><optgroup key={group} label={t('sheets.pe.'+group)}>{acts.map(a=><option key={a} value={a}>{t('sheets.pe.'+a)}</option>)}</optgroup>)}
  </NativeSelect></label>
  {(act==='addField'||act==='removeField'||act==='moveField')&&sel(t('sheets.pe.area'),area,setArea,areaOpts,'sheets-pe-area')}
  {act==='moveField'&&sel(t('sheets.pe.to'),to,setTo,areaOpts,'sheets-pe-to')}
  {usesField&&sel(t('sheets.pe.field'),chosen,setFieldPick,fieldList.map(n=>({value:n,text:n})),'sheets-pe-field')}
  {valueActs&&sel(t('sheets.pe.value'),String(idx),v=>setVi(Number(v)),p.values.map((v,i)=>({value:String(i),text:v.field})),'sheets-pe-value')}
  {(act==='valueFunc'||(act==='addField'&&area==='values'))&&sel(t('sheets.pe.func'),func,setFunc,PIVOT_VALUE_FUNCS.map(f=>({value:f,text:t('sheets.pe.f.'+f)})),'sheets-pe-func')}
  {act==='valueShowAs'&&sel(t('sheets.pe.showAs'),showAs,setShowAs,PIVOT_SHOW_AS.map(f=>({value:f,text:t('sheets.pe.s.'+f)})),'sheets-pe-showas')}
  {act==='valueFormat'&&sel(t('sheets.pe.format'),fmt,setFmt,[{value:'',text:t('sheets.pe.fmtNone')},...PIVOT_NUMBER_FORMATS.map(f=>({value:f,text:f}))],'sheets-pe-format')}
  {act==='sort'&&sel(t('sheets.pe.order'),order,setOrder,PIVOT_ORDERS.map(f=>({value:f,text:t('sheets.pe.o.'+f)})),'sheets-pe-order')}
  {act==='group'&&sel(t('sheets.pe.by'),by,setBy,PIVOT_GROUPS.map(f=>({value:f,text:t('sheets.pe.g.'+f)})),'sheets-pe-by')}
  {act==='layout'&&sel(t('sheets.pe.layoutKind'),layout,setLayout,PIVOT_LAYOUTS.map(f=>({value:f,text:t('sheets.pe.l.'+f)})),'sheets-pe-layout')}
  {act==='totals'&&sel(t('sheets.pe.totals'),totals,setTotals,(['both','rows','cols','off'] as const).map(f=>({value:f,text:t('sheets.pe.t.'+f)})),'sheets-pe-totals')}
  {act==='subtotals'&&sel(t('sheets.pe.subtotals'),subs,setSubs,PIVOT_SUBTOTALS.map(f=>({value:f,text:t('sheets.pe.st.'+f)})),'sheets-pe-subtotals')}
  {act==='headers'&&sel(t('sheets.pe.headers'),heads,setHeads,(['show','hide'] as const).map(f=>({value:f,text:t('sheets.pe.h.'+f)})),'sheets-pe-headers')}
  {act==='style'&&sel(t('sheets.pe.style'),style,setStyle,PIVOT_STYLES.map(f=>({value:f,text:f.replace('PivotStyle','')})),'sheets-pe-style')}
  {act==='filterItems'&&<label className="flex flex-col gap-1">{t('sheets.pe.items')}<NativeInput className={field} value={items} maxLength={2000} disabled={action.busy} onChange={e=>setItems(e.currentTarget.value)} data-testid="sheets-pe-items"/></label>}
  <Button variant="outline" size="compact" disabled={action.busy||(going?!place:!op)} onClick={()=>void(going&&place?action.run('sheets.navigate',place):action.run('sheets.pivotEdit',op))} data-testid="sheets-pe-apply">{t('sheets.pe.apply')}</Button>
  <p className="text-ink-3">{t(act==='useSelection'?'sheets.pe.sourceHint':usesField&&fieldList.length===0?'sheets.pe.noField':'sheets.pe.hint',{range:rangeAddress(r)})}</p>
  {action.notice?<p role="alert">{action.notice}</p>:null}
 </div>;
}
/** Paste special from the engine's own copy (formulas and formats, filled by Ctrl+C or the copy menu), in one grouped menu. One undo step. */
type PasteWhat=PasteOp['what'];
const PASTE_COMBINE=['none','add','subtract','multiply','divide'] as const;
function PasteGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [what,setWhat]=useState<PasteWhat>('values');const [combine,setCombine]=useState<(typeof PASTE_COMBINE)[number]>('none');const [skip,setSkip]=useState(false);const [flip,setFlip]=useState(false);
 if(!s)return null;
 const calc=['all','formulas','values','valuesAndNumberFormats'].includes(what),clip=s.clip??null,cutBad=!!clip?.cut&&(what!=='all'||(calc&&combine!=='none')||skip||flip);
 const opt=(id:PasteWhat)=><option key={id} value={id}>{t('sheets.ps.'+id)}</option>;
 const apply=()=>{void action.run('sheets.paste',{what,...(calc&&combine!=='none'?{operation:combine}:{}),skipBlanks:skip,transpose:flip});};
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.ps.title')}>
  <span>{t('sheets.ps.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.ps.what')}<NativeSelect className={field} value={what} disabled={action.busy} onChange={e=>setWhat(e.currentTarget.value as PasteWhat)} data-testid="sheets-ps-what">
   <optgroup label={t('sheets.ps.groupAll')}>{(['all','allExceptBorders'] as PasteWhat[]).map(opt)}</optgroup>
   <optgroup label={t('sheets.ps.groupContent')}>{(['formulas','values','formulasAndNumberFormats','valuesAndNumberFormats'] as PasteWhat[]).map(opt)}</optgroup>
   <optgroup label={t('sheets.ps.groupLook')}>{(['formats','columnWidths'] as PasteWhat[]).map(opt)}</optgroup>
  </NativeSelect></label>
  {calc&&<label className="flex flex-col gap-1">{t('sheets.ps.combine')}<NativeSelect className={field} value={combine} disabled={action.busy} onChange={e=>setCombine(e.currentTarget.value as (typeof PASTE_COMBINE)[number])} data-testid="sheets-ps-combine">{PASTE_COMBINE.map(c=><option key={c} value={c}>{t('sheets.ps.op.'+c)}</option>)}</NativeSelect></label>}
  <Checkbox label={t('sheets.ps.skip')} checked={skip} disabled={action.busy} onChange={e=>setSkip(e.currentTarget.checked)}/>
  <Checkbox label={t('sheets.ps.transpose')} checked={flip} disabled={action.busy} onChange={e=>setFlip(e.currentTarget.checked)}/>
  <Button variant="outline" size="compact" disabled={action.busy||!clip||cutBad} onClick={apply} data-testid="sheets-ps-apply">{t('sheets.ps.apply')}</Button>
  <p className="text-ink-3">{clip?t(clip.cut?'sheets.ps.cutDone':'sheets.ps.copied',{range:clip.sheetName+'!'+clip.address}):t('sheets.ps.nothing')}</p>
  {cutBad&&<p className="text-ink-3">{t('sheets.ps.cutOnly')}</p>}
 </div>;
}
/** Named ranges in one grouped menu: define the selection, redefine, go to or delete a name. One undo step each. */
type NameAction='define'|'defineSheet'|'replace'|'replaceSheet'|'constant'|'constantSheet'|'setConstant'|'comment'|'fromSelection'|'go'|'rename'|'delete';
function NamesGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [act,setAct]=useState<NameAction>('define');const [pick,setPick]=useState('');const [nameFilter,setNameFilter]=useState<NameFilter>('all');const [nameQuery,setNameQuery]=useState('');const [name,setName]=useState('');const [value,setValue]=useState('');const [note,setNote]=useState('');const [fromTop,setFromTop]=useState(true);const [fromLeft,setFromLeft]=useState(false);const [fromReplace,setFromReplace]=useState(false);
 if(!s)return null;
 const list=s.names??[],shownNames=filterNames(list,nameFilter,nameQuery,s.sheetName),chosen=list.find(n=>n.scope+'|'+n.name===pick)??null,defining=act==='define'||act==='defineSheet'||act==='replace'||act==='replaceSheet'||act==='constant'||act==='constantSheet',needsValue=act==='constant'||act==='constantSheet'||act==='setConstant',valueBad=needsValue&&(value===''||[...value].length>MAX_COMMENT_CHARS||/[\u0000-\u001f\u007f]/.test(value)),noteBad=act==='comment'&&([...note].length>MAX_COMMENT_CHARS||/[\u0000-\u001f\u007f]/.test(note));
 const fromSel=act==='fromSelection',fromBad=fromSel&&(!(fromTop&&(s.range?.r1??0)>(s.range?.r0??0))&&!(fromLeft&&(s.range?.c1??0)>(s.range?.c0??0)));
 const own=chosen&&(chosen.scope==='Workbook'||chosen.scope===s.sheetName),target=chosen?nameTarget(chosen.refersTo):null,dest=target?(s.workbook?.sheets??[]).find(x=>x.name.toLowerCase()===target.sheet.toLowerCase()&&x.visibility==='Visible'):undefined;
 const problem=fromSel?null:defining?(nameProblem(name.trim())):act==='rename'?(chosen&&own?nameProblem(name.trim()):'pick'):act==='go'?(target&&dest?null:'target'):(chosen&&own?null:'pick'),blocked=!!problem||valueBad||noteBad;
 const apply=()=>{
  const scopeOf=chosen?(chosen.scope==='Workbook'?'workbook':'sheet'):'workbook';
  if(fromSel)void action.run('sheets.names',{kind:'fromSelection',top:fromTop,left:fromLeft,replace:fromReplace});
  else if(act==='constant'||act==='constantSheet')void action.run('sheets.names',{kind:'constant',name:name.trim(),scope:act==='constantSheet'?'sheet':'workbook',value:constantValue(value)}).then(r=>{if(r!==null){setName('');setValue('');}});
  else if(act==='setConstant'&&chosen)void action.run('sheets.names',{kind:'constant',name:chosen.name,scope:scopeOf,value:constantValue(value),replace:true}).then(r=>{if(r!==null)setValue('');});
  else if(act==='comment'&&chosen)void action.run('sheets.names',{kind:'comment',name:chosen.name,scope:scopeOf,text:note});
  else if(defining)void action.run('sheets.names',{kind:'define',name:name.trim(),scope:act==='defineSheet'||act==='replaceSheet'?'sheet':'workbook',replace:act==='replace'||act==='replaceSheet'}).then(r=>{if(r!==null)setName('');});
  else if(act==='go'&&target&&dest)void action.run('sheets.navigate',{sheet:dest.index,address:chosen?nameSpan(chosen.refersTo)??target.address:target.address});
  else if(act==='rename'&&chosen)void action.run('sheets.names',{kind:'rename',name:chosen.name,scope:scopeOf,newName:name.trim()}).then(r=>{if(r!==null){setName('');setPick('');}});
  else if(chosen)void action.run('sheets.names',{kind:'delete',name:chosen.name,scope:chosen.scope==='Workbook'?'workbook':'sheet'});
 };
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.nm.title')}>
  <span>{t('sheets.nm.title')}</span>
  {list.length>1&&<>
   <label className="flex flex-col gap-1">{t('sheets.nm.filter')}<NativeSelect className={field} value={nameFilter} disabled={action.busy} onChange={e=>setNameFilter(e.currentTarget.value as NameFilter)} data-testid="sheets-nm-filter">{NAME_FILTERS.map(k=><option key={k} value={k}>{t('sheets.nm.f.'+k)}</option>)}</NativeSelect></label>
   <label className="flex flex-col gap-1">{t('sheets.nm.search')}<NativeInput className={field} value={nameQuery} maxLength={MAX_NAME_QUERY} disabled={action.busy} onChange={e=>setNameQuery(e.currentTarget.value)} data-testid="sheets-nm-search"/></label>
   <p className="text-ink-3" data-testid="sheets-nm-shown">{t('sheets.nm.shown',{n:shownNames.length,total:list.length})}</p>
  </>}
  <label className="flex flex-col gap-1">{t('sheets.nm.existing')}<NativeSelect className={field} value={pick} disabled={action.busy} onChange={e=>setPick(e.currentTarget.value)} data-testid="sheets-nm-pick"><option value="">{t('sheets.nm.none')}</option>{shownNames.map(n=><option key={n.scope+'|'+n.name} value={n.scope+'|'+n.name}>{n.name} ({n.scope}) {n.refersTo}</option>)}</NativeSelect></label>
  <label className="flex flex-col gap-1">{t('sheets.nm.action')}<NativeSelect className={field} value={act} disabled={action.busy} onChange={e=>setAct(e.currentTarget.value as NameAction)} data-testid="sheets-nm-action">
   <optgroup label={t('sheets.nm.groupSelection')}><option value="define">{t('sheets.nm.define')}</option><option value="defineSheet">{t('sheets.nm.defineSheet')}</option><option value="replace">{t('sheets.nm.replace')}</option><option value="replaceSheet">{t('sheets.nm.replaceSheet')}</option></optgroup>
   <optgroup label={t('sheets.nm.groupConstant')}><option value="constant">{t('sheets.nm.constant')}</option><option value="constantSheet">{t('sheets.nm.constantSheet')}</option><option value="setConstant">{t('sheets.nm.setConstant')}</option><option value="comment">{t('sheets.nm.comment')}</option></optgroup>
   <optgroup label={t('sheets.nm.groupFrom')}><option value="fromSelection">{t('sheets.nm.fromSelection')}</option></optgroup>
   <optgroup label={t('sheets.nm.groupName')}><option value="go">{t('sheets.nm.go')}</option><option value="rename">{t('sheets.nm.rename')}</option><option value="delete">{t('sheets.nm.delete')}</option></optgroup>
  </NativeSelect></label>
  {(defining||act==='rename')&&<label className="flex flex-col gap-1">{t(act==='rename'?'sheets.nm.newName':'sheets.nm.name')}<NativeInput className={field} value={name} maxLength={64} aria-invalid={name.trim()!==''&&!!problem} disabled={action.busy} onChange={e=>setName(e.currentTarget.value)} data-testid="sheets-nm-name"/></label>}
  {fromSel&&<>
   <Checkbox label={t('sheets.nm.fromTop')} checked={fromTop} disabled={action.busy} onChange={e=>setFromTop(e.currentTarget.checked)}/>
   <Checkbox label={t('sheets.nm.fromLeft')} checked={fromLeft} disabled={action.busy} onChange={e=>setFromLeft(e.currentTarget.checked)}/>
   <Checkbox label={t('sheets.nm.fromReplace')} checked={fromReplace} disabled={action.busy} onChange={e=>setFromReplace(e.currentTarget.checked)}/>
   {fromBad&&<p className="text-ink-3">{t('sheets.nm.fromNeed')}</p>}
  </>}
  {needsValue&&<label className="flex flex-col gap-1">{t('sheets.nm.value')}<NativeInput className={field} value={value} maxLength={MAX_COMMENT_CHARS} aria-invalid={valueBad&&value!==''} disabled={action.busy} onChange={e=>setValue(e.currentTarget.value)} data-testid="sheets-nm-value"/></label>}
  {act==='comment'&&<label className="flex flex-col gap-1">{t('sheets.nm.note')}<NativeInput className={field} value={note} maxLength={MAX_COMMENT_CHARS} aria-invalid={noteBad} disabled={action.busy} onChange={e=>setNote(e.currentTarget.value)} data-testid="sheets-nm-note"/></label>}
  <Button variant="outline" size="compact" disabled={action.busy||blocked||fromBad} onClick={apply} data-testid="sheets-nm-apply">{t('sheets.nm.apply')}</Button>
  {chosen&&chosen.comment!==''&&<p className="text-ink-3" data-testid="sheets-nm-comment">{t('sheets.nm.commentNow',{text:chosen.comment})}</p>}
  <p className="text-ink-3">{t(fromSel||(defining&&s.range&&!needsValue)?'sheets.nm.scope':'sheets.nm.scopeName',{range:s.range?rangeAddress(s.range):s.address})}</p>
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
/** Every note and comment of this sheet in reading order: filter by state, go to one, resolve or reopen it, or delete it. One undo step each. Shown only when the sheet has notes. */
type NoteFilter='all'|'open'|'resolved';type NoteListAction='go'|'resolve'|'reopen'|'remove';
function NoteListGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [filter,setFilter]=useState<NoteFilter>('all');const [pick,setPick]=useState('');const [act,setAct]=useState<NoteListAction>('go');
 const list=s?.noteList;if(!s||!list||list.notes.length===0)return null;
 const shown=list.notes.filter(n=>filter==='all'||(filter==='resolved')===n.resolved),chosen=shown.find(n=>n.cell===pick)??shown[0]??null,open=list.notes.filter(n=>!n.resolved).length;
 const bad=!chosen||(act==='resolve'&&(chosen.resolved||!chosen.threaded))||(act==='reopen'&&(!chosen.resolved||!chosen.threaded));
 const apply=()=>{if(!chosen)return;if(act==='go')void action.run('sheets.navigate',{sheet:s.sheet,address:chosen.cell});else void action.run('sheets.noteReview',{kind:act,cell:chosen.cell});};
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.nl.title')}>
  <span>{t('sheets.nl.title')}</span>
  <p className="text-ink-3">{t('sheets.nl.count',{total:list.total,open})}{list.truncated?' '+t('sheets.nl.truncated'):''}</p>
  <label className="flex flex-col gap-1">{t('sheets.nl.filter')}<NativeSelect className={field} value={filter} disabled={action.busy} onChange={e=>setFilter(e.currentTarget.value as NoteFilter)} data-testid="sheets-nl-filter">{(['all','open','resolved'] as NoteFilter[]).map(f=><option key={f} value={f}>{t('sheets.nl.f.'+f)}</option>)}</NativeSelect></label>
  <label className="flex flex-col gap-1">{t('sheets.nl.note')}<NativeSelect className={field} value={chosen?.cell??''} disabled={action.busy||shown.length===0} onChange={e=>setPick(e.currentTarget.value)} data-testid="sheets-nl-note">{shown.length===0&&<option value="">{t('sheets.nl.none')}</option>}{shown.map(n=><option key={n.cell} value={n.cell}>{n.cell+' · '+(n.author?n.author+': ':'')+n.text.slice(0,60)+(n.resolved?' · '+t('sheets.nt.resolved'):'')}</option>)}</NativeSelect></label>
  {chosen&&<p data-testid="sheets-nl-text">{chosen.text}{chosen.replies>0?' ('+t('sheets.nl.replies',{n:chosen.replies})+')':''}</p>}
  <label className="flex flex-col gap-1">{t('sheets.nl.action')}<NativeSelect className={field} value={act} disabled={action.busy} onChange={e=>setAct(e.currentTarget.value as NoteListAction)} data-testid="sheets-nl-action">{(['go','resolve','reopen','remove'] as NoteListAction[]).map(a=><option key={a} value={a}>{t('sheets.nl.a.'+a)}</option>)}</NativeSelect></label>
  <Button variant="outline" size="compact" disabled={action.busy||bad} onClick={apply} data-testid="sheets-nl-apply">{t('sheets.nl.apply')}</Button>
 </div>;
}
/** Formula auditing in one grouped menu: trace what the active cell reads and what reads it, list error cells and circular references, watch cells. Reads only; the watch list is view state. */
type AuditChoice='trace'|'errors'|'watchAdd'|'clear';
function AuditGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [act,setAct]=useState<AuditChoice>('trace');const [go,setGo]=useState('');const [unwatch,setUnwatch]=useState('');
 if(!s)return null;
 const result=s.auditResult??null,watch=s.watchRows??[],sheets=s.workbook?.sheets??[];
 const items:{key:string;label:string;sheet:number;address:string}[]=[];
 if(result?.trace){const at=(name:string)=>sheets.find(x=>x.name===name)?.index??-1;
  result.trace.precedents.forEach((p,i)=>{const sh=at(p.sheet);if(sh>=0)items.push({key:'p'+i,label:t('sheets.au.reads')+' '+p.sheet+'!'+p.range,sheet:sh,address:p.range.split(':')[0]});});
  result.trace.dependents.forEach((d,i)=>{const sh=at(d.sheet);if(sh>=0)items.push({key:'d'+i,label:t('sheets.au.readBy')+' '+d.sheet+'!'+d.cell,sheet:sh,address:d.cell});});}
 if(result?.errors)result.errors.errors.forEach((e,i)=>items.push({key:'e'+i,label:e.sheetName+'!'+e.cell+' '+e.error,sheet:e.sheet,address:e.cell}));
 const chosen=items.find(i=>i.key===go)??items[0]??null,watched=watch.find(w=>w.ref===unwatch)??watch[0]??null;
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.au.title')}>
  <span>{t('sheets.au.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.au.action')}<NativeSelect className={field} value={act} disabled={action.busy} onChange={e=>setAct(e.currentTarget.value as AuditChoice)} data-testid="sheets-au-action">
   <optgroup label={t('sheets.au.groupTrace')}><option value="trace">{t('sheets.au.a.trace',{cell:s.address})}</option></optgroup>
   <optgroup label={t('sheets.au.groupCheck')}><option value="errors">{t('sheets.au.a.errors')}</option></optgroup>
   <optgroup label={t('sheets.au.groupWatch')}><option value="watchAdd">{t('sheets.au.a.watchAdd',{cell:s.address})}</option></optgroup>
   <optgroup label={t('sheets.au.groupResults')}><option value="clear">{t('sheets.au.a.clear')}</option></optgroup>
  </NativeSelect></label>
  <Button variant="outline" size="compact" disabled={action.busy} onClick={()=>void action.run('sheets.audit',{kind:act})} data-testid="sheets-au-apply">{t('sheets.au.apply')}</Button>
  {result?.trace&&<p data-testid="sheets-au-trace">{t('sheets.au.traceOf',{cell:result.trace.cell,formula:result.trace.formula??t('sheets.au.noFormula'),reads:result.trace.precedentsTotal,readBy:result.trace.dependentsTotal})}</p>}
  {result?.errors&&<p data-testid="sheets-au-errors">{result.errors.total===0&&result.errors.circular.length===0?t('sheets.au.noErrors'):t('sheets.au.errorCount',{n:result.errors.total})+(result.errors.circular.length>0?' '+t('sheets.au.circular',{cells:result.errors.circular.join(', ')}):'')}{result.errors.total>result.errors.errors.length?' '+t('sheets.au.truncated'):''}</p>}
  {items.length>0&&<>
   <label className="flex flex-col gap-1">{t('sheets.au.found')}<NativeSelect className={field} value={chosen?.key??''} disabled={action.busy} onChange={e=>setGo(e.currentTarget.value)} data-testid="sheets-au-found">{items.map(i=><option key={i.key} value={i.key}>{i.label}</option>)}</NativeSelect></label>
   <Button variant="outline" size="compact" disabled={action.busy||!chosen} onClick={()=>{if(chosen)void action.run('sheets.navigate',{sheet:chosen.sheet,address:chosen.address});}} data-testid="sheets-au-go">{t('sheets.au.go')}</Button>
  </>}
  {watch.length>0&&<div className="flex flex-col gap-1" data-testid="sheets-au-watch">
   <span>{t('sheets.au.watching',{n:watch.length})}</span>
   <ul>{watch.map(w=><li key={w.ref}>{w.ref.replace(/'/g,'')}: {w.value}{w.formula?' ('+w.formula+')':''}</li>)}</ul>
   <label className="flex flex-col gap-1">{t('sheets.au.unwatch')}<NativeSelect className={field} value={watched?.ref??''} disabled={action.busy} onChange={e=>setUnwatch(e.currentTarget.value)} data-testid="sheets-au-unwatch">{watch.map(w=><option key={w.ref} value={w.ref}>{w.ref.replace(/'/g,'')}</option>)}</NativeSelect></label>
   <Button variant="outline" size="compact" disabled={action.busy||!watched} onClick={()=>{if(watched)void action.run('sheets.audit',{kind:'watchRemove',ref:watched.ref});}} data-testid="sheets-au-remove">{t('sheets.au.remove')}</Button>
  </div>}
  <p className="text-ink-3">{t('sheets.au.hint')}</p>
  {action.notice?<p role="alert">{action.notice}</p>:null}
 </div>;
}
/** Insert Symbol: one grouped select with the symbol and its code, appended to the text of the selected cell. One undo step. */
function SymbolGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [pick,setPick]=useState('€');
 if(!s)return null;
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.sy.title')}>
  <span>{t('sheets.sy.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.sy.pick')}<NativeSelect className={field} value={pick} disabled={action.busy} onChange={e=>setPick(e.currentTarget.value)} data-testid="sheets-sy-pick">
   {(Object.keys(SYMBOL_GROUPS) as SymbolGroup[]).map(g=><optgroup key={g} label={t('sheets.sy.g.'+g)}>{SYMBOL_GROUPS[g].map(c=><option key={c} value={c}>{c+'  '+symbolCode(c)}</option>)}</optgroup>)}
  </NativeSelect></label>
  <Button variant="outline" size="compact" disabled={action.busy||!isSymbol(pick)} onClick={()=>void action.run('sheets.insertSymbol',{char:pick})} data-testid="sheets-sy-apply">{t('sheets.sy.apply',{cell:s.address})}</Button>
  <p className="text-ink-3">{t('sheets.sy.hint')}</p>
  {action.notice?<p role="alert">{action.notice}</p>:null}
 </div>;
}
/** Workbook statistics and the accessibility check in one grouped menu. Reads only. */
type ReviewChoice='stats'|'accessibility'|'clear';
function ReviewInfoGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [act,setAct]=useState<ReviewChoice>('stats');const [pick,setPick]=useState(0);
 if(!s)return null;
 const r=s.reviewResult??null,st=r?.stats,iss=r?.issues,chosen=iss?.issues[pick]??iss?.issues[0]??null;
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.ri.title')}>
  <span>{t('sheets.ri.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.ri.action')}<NativeSelect className={field} value={act} disabled={action.busy} onChange={e=>setAct(e.currentTarget.value as ReviewChoice)} data-testid="sheets-ri-action">
   <optgroup label={t('sheets.ri.groupInfo')}><option value="stats">{t('sheets.ri.a.stats')}</option></optgroup>
   <optgroup label={t('sheets.ri.groupCheck')}><option value="accessibility">{t('sheets.ri.a.accessibility')}</option></optgroup>
   <optgroup label={t('sheets.ri.groupResults')}><option value="clear">{t('sheets.ri.a.clear')}</option></optgroup>
  </NativeSelect></label>
  <Button variant="outline" size="compact" disabled={action.busy} onClick={()=>void action.run('sheets.review',{kind:act})} data-testid="sheets-ri-apply">{t('sheets.ri.apply')}</Button>
  {st&&<ul data-testid="sheets-ri-stats">
   <li>{t('sheets.ri.sheet',{name:st.sheet.name,cells:st.sheet.cellsWithData,formulas:st.sheet.formulas,end:st.sheet.endOfSheet??'-'})}</li>
   <li>{t('sheets.ri.sheetObjects',{tables:st.sheet.tables,charts:st.sheet.charts,comments:st.sheet.comments})}</li>
   <li>{t('sheets.ri.book',{sheets:st.workbook.sheets,cells:st.workbook.cellsWithData,formulas:st.workbook.formulas})}</li>
   <li>{t('sheets.ri.bookObjects',{tables:st.workbook.tables,charts:st.workbook.charts,names:st.workbook.names})}</li>
  </ul>}
  {iss&&<p data-testid="sheets-ri-issues">{iss.total===0?t('sheets.ri.none'):t('sheets.ri.count',{n:iss.total})+(iss.total>iss.issues.length?' '+t('sheets.ri.truncated'):'')}</p>}
  {iss&&iss.issues.length>0&&<>
   <label className="flex flex-col gap-1">{t('sheets.ri.found')}<NativeSelect className={field} value={chosen?iss.issues.indexOf(chosen):0} disabled={action.busy} onChange={e=>setPick(Number(e.currentTarget.value))} data-testid="sheets-ri-found">{iss.issues.map((i,n)=><option key={n} value={n}>{i.sheetName+': '+t('sheets.ri.i.'+i.code)+(i.object?' ('+i.object+')':'')+(i.count?' x'+i.count:'')}</option>)}</NativeSelect></label>
   <Button variant="outline" size="compact" disabled={action.busy||!chosen} onClick={()=>{if(chosen)void action.run('sheets.navigate',{sheet:chosen.sheet,address:'A1'});}} data-testid="sheets-ri-go">{t('sheets.ri.go')}</Button>
  </>}
  <p className="text-ink-3">{t('sheets.ri.hint')}</p>
  {action.notice?<p role="alert">{action.notice}</p>:null}
 </div>;
}
/** Inserts or deletes the selected cells and moves their neighbours: one grouped choice and one button. One undo step; refused with a reason when merges, tables, charts and the like would be left behind. */
const SHIFT_OPS:Record<ShiftKind,{kind:'insert'|'delete';shift:'down'|'right'|'up'|'left'}>={insertDown:{kind:'insert',shift:'down'},insertRight:{kind:'insert',shift:'right'},deleteUp:{kind:'delete',shift:'up'},deleteLeft:{kind:'delete',shift:'left'}};
function ShiftCellsGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [pick,setPick]=useState<ShiftKind>('insertDown');
 const r=s?.range;if(!s||!r)return null;
 const op=parseShiftCommand(SHIFT_OPS[pick]),problem=shiftBlockProblem(op,r,1_048_576,16_384);
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.sh.title')}>
  <span>{t('sheets.sh.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.sh.action')}<NativeSelect className={field} value={pick} disabled={action.busy} onChange={e=>setPick(e.currentTarget.value as ShiftKind)} data-testid="sheets-sh-action">
   <optgroup label={t('sheets.sh.groupInsert')}><option value="insertDown">{t('sheets.sh.insertDown')}</option><option value="insertRight">{t('sheets.sh.insertRight')}</option></optgroup>
   <optgroup label={t('sheets.sh.groupDelete')}><option value="deleteUp">{t('sheets.sh.deleteUp')}</option><option value="deleteLeft">{t('sheets.sh.deleteLeft')}</option></optgroup>
  </NativeSelect></label>
  <Button variant="outline" size="compact" disabled={action.busy||!!problem} onClick={()=>void action.run('sheets.shiftCells',op)} data-testid="sheets-sh-apply">{t('sheets.sh.apply')}</Button>
  <p className="text-ink-3">{t(problem?'sheets.sh.need':'sheets.sh.scope',{range:rangeAddress(r)})}</p>
  {action.notice?<p role="alert">{action.notice}</p>:null}
 </div>;
}
/** Finds cells by what they are with the engine's Go To Special search: blanks, formulas, errors, comments and more. Lists the runs of cells and jumps to the chosen one. Reads only. */
function FindSpecialGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();
 const [kind,setKind]=useState<SpecialKind>('blanks'),[found,setFound]=useState<{kind:SpecialKind;sheet:number;result:SpecialResult}|null>(null);
 if(!s)return null;
 const shown=found&&found.sheet===s.sheet?found:null,single=!s.range||(s.range.r0===s.range.r1&&s.range.c0===s.range.c1);
 const run=async()=>{const r=await action.run('sheets.findSpecial',{kind});if(r!==null)setFound({kind,sheet:s.sheet,result:parseSpecialResult(r)});};
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.gs.title')}>
  <span>{t('sheets.gs.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.gs.kind')}<NativeSelect className={field} value={kind} disabled={action.busy} onChange={e=>setKind(e.currentTarget.value as SpecialKind)} data-testid="sheets-gs-kind">
   <optgroup label={t('sheets.gs.groupContent')}>{(['blanks','constants','formulas','text','numbers','errors'] as const).map(k=><option key={k} value={k}>{t('sheets.gs.k.'+k)}</option>)}</optgroup>
   <optgroup label={t('sheets.gs.groupRules')}>{(['comments','conditionalFormats','dataValidation','invalidData'] as const).map(k=><option key={k} value={k}>{t('sheets.gs.k.'+k)}</option>)}</optgroup>
  </NativeSelect></label>
  <Button variant="outline" size="compact" disabled={action.busy} onClick={()=>void run()} data-testid="sheets-gs-find">{t('sheets.gs.find')}</Button>
  <p className="text-ink-3">{t(single?'sheets.gs.scopeSheet':'sheets.gs.scopeSelection')}</p>
  {shown&&<p data-testid="sheets-gs-count">{shown.result.count===0?t('sheets.gs.none'):t('sheets.gs.count',{n:shown.result.count,runs:shown.result.ranges.length})+(shown.result.truncated?' '+t('sheets.gs.truncated'):'')}</p>}
  {shown&&shown.result.ranges.length>0&&<label className="flex flex-col gap-1">{t('sheets.gs.go')}<NativeSelect className={field} value="" disabled={action.busy} onChange={e=>{const a=e.currentTarget.value;if(a)void action.run('sheets.navigate',{sheet:s.sheet,address:a});}} data-testid="sheets-gs-go"><option value="">{t('sheets.gs.pick')}</option>{shown.result.ranges.map(r=><option key={r} value={r}>{r}</option>)}</NativeSelect></label>}
  {action.notice?<p role="alert">{action.notice}</p>:null}
 </div>;
}
/** Spelling of the text cells in the selection or the top-left 10,000 cells, against the shipped English (US) word list. One select for what to do with a found word. A change is one undo step per cell. */
type SpellAct='change'|'ignore'|'add';
const SPELL_SHEET='A1:T500';
const fetchAsset=async(path:string)=>{const r=await fetch(location.origin+path);if(!r.ok)throw Error('asset '+r.status);return r.text();};
function SpellingGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();
 const [scope,setScope]=useState<'selection'|'sheet'>('selection'),[report,setReport]=useState<SpellReport|null>(null),[pick,setPick]=useState(0),[to,setTo]=useState(''),[act,setAct]=useState<SpellAct>('change');
 const [dict,setDict]=useState<ReadonlySet<string>|null>(null),[ignore,setIgnore]=useState<ReadonlySet<string>>(new Set()),[user,setUser]=useState<ReadonlySet<string>>(()=>readUserWords());
 if(!s)return null;
 const range=scope==='sheet'?SPELL_SHEET:s.range?rangeAddress(s.range):s.address,valid=!!parsePanelRange(range);
 const issues=report?.issues??[],chosen=issues[pick]??issues[0]??null,options=chosen&&dict?suggest(chosen.word,dict):[];
 const drop=(word:string,cell?:string)=>{if(!report)return;const next=report.issues.filter(i=>cell?!(i.cell===cell&&i.word===word):i.word.toLowerCase()!==word.toLowerCase());setReport({...report,issues:next,total:Math.max(0,report.total-(report.issues.length-next.length))});setPick(0);setTo('');};
 const check=async()=>{
  if(!valid)return;
  let d=dict;if(!d){try{d=await loadDictionary(fetchAsset);setDict(d);}catch{action.setNotice(t('sheets.spl.noDict'));return;}}
  const cells=await action.run('sheets.analyzeRange',{range});if(!cells)return;
  setReport(checkCells(cells as RangeCell[],d,user,ignore));setPick(0);setTo('');
 };
 const problem=act==='change'?replacementProblem(to):null;
 const apply=()=>{
  if(!chosen)return;
  if(act==='change'&&!problem)void action.run('sheets.spellChange',{cell:chosen.cell,word:chosen.word,to:to.trim()}).then(r=>{if(r!==null)drop(chosen.word,chosen.cell);});
  else if(act==='ignore'){setIgnore(new Set([...ignore,chosen.word.toLowerCase()]));drop(chosen.word);}
  else if(act==='add'){setUser(addUserWord(chosen.word));drop(chosen.word);}
 };
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.spl.title')}>
  <span>{t('sheets.spl.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.spl.scope')}<NativeSelect className={field} value={scope} disabled={action.busy} onChange={e=>{setScope(e.currentTarget.value as 'selection'|'sheet');setReport(null);}} data-testid="sheets-sp-scope"><option value="selection">{t('sheets.spl.selection')}</option><option value="sheet">{t('sheets.spl.sheet',{range:SPELL_SHEET})}</option></NativeSelect></label>
  <Button variant="outline" size="compact" disabled={action.busy||!valid} onClick={()=>void check()} data-testid="sheets-sp-check">{t('sheets.spl.check')}</Button>
  {!valid&&<p className="text-ink-3">{t('sheets.spl.big')}</p>}
  {report&&<p data-testid="sheets-sp-count">{report.total===0?t('sheets.spl.none',{n:report.scanned}):t('sheets.spl.count',{n:report.total})+(report.total>report.issues.length&&report.issues.length>0?' '+t('sheets.spl.truncated'):'')}</p>}
  {chosen&&<>
   <label className="flex flex-col gap-1">{t('sheets.spl.found')}<NativeSelect className={field} value={issues.indexOf(chosen)} disabled={action.busy} onChange={e=>{const n=Number(e.currentTarget.value);setPick(n);setTo('');const c=issues[n];if(c)void action.run('sheets.navigate',{sheet:s.sheet,address:c.cell});}} data-testid="sheets-sp-found">{issues.map((i,n)=><option key={n} value={n}>{i.cell+': '+i.word}</option>)}</NativeSelect></label>
   <label className="flex flex-col gap-1">{t('sheets.spl.suggest')}<NativeSelect className={field} value="" disabled={action.busy||options.length===0} onChange={e=>setTo(e.currentTarget.value)} data-testid="sheets-sp-suggest"><option value="">{options.length===0?t('sheets.spl.noSuggest'):t('sheets.spl.pickSuggest')}</option>{options.map(o=><option key={o} value={o}>{o}</option>)}</NativeSelect></label>
   <label className="flex flex-col gap-1">{t('sheets.spl.to')}<NativeInput className={field} value={to} maxLength={64} aria-invalid={to!==''&&!!problem} disabled={action.busy||act!=='change'} onChange={e=>setTo(e.currentTarget.value)} data-testid="sheets-sp-to"/></label>
   <label className="flex flex-col gap-1">{t('sheets.spl.action')}<NativeSelect className={field} value={act} disabled={action.busy} onChange={e=>setAct(e.currentTarget.value as SpellAct)} data-testid="sheets-sp-action"><option value="change">{t('sheets.spl.a.change')}</option><option value="ignore">{t('sheets.spl.a.ignore')}</option><option value="add">{t('sheets.spl.a.add')}</option></NativeSelect></label>
   <Button variant="outline" size="compact" disabled={action.busy||(act==='change'&&!!problem)} onClick={apply} data-testid="sheets-sp-apply">{t('sheets.spl.apply')}</Button>
  </>}
  <p className="text-ink-3">{t('sheets.spl.hint')}</p>
  {action.notice?<p role="alert">{action.notice}</p>:null}
 </div>;
}
/** Facts about the selected cell, read live from the engine: type, format, formula, protection, merge, table, rules, note, link, spill and formula links. Display only. */
function CellInfoGroup(){
 const {t}=useT(),s=useSheetsSelection();const i=s?.cellInfo;if(!s||!i)return null;
 const lines:string[]=[t('sheets.ci.type',{type:t('sheets.ci.t.'+i.type),format:i.numberFormat})];
 if(i.formula)lines.push(t('sheets.ci.formula',{formula:i.formula}));
 if(i.reads>0||i.readBy>0)lines.push(t('sheets.ci.links',{reads:i.reads,readBy:i.readBy}));
 lines.push(t(i.sheetProtected&&i.locked?'sheets.ci.lockedProtected':i.locked?'sheets.ci.locked':'sheets.ci.unlocked')+(i.hiddenFormula?' '+t('sheets.ci.hiddenFormula'):''));
 if(i.merged)lines.push(t('sheets.ci.merged',{range:i.merged}));
 if(i.table)lines.push(t('sheets.ci.table',{name:i.table}));
 if(i.validation&&i.validation!=='any')lines.push(t('sheets.ci.validation',{kind:i.validation}));
 if(i.highlightRules>0)lines.push(t('sheets.ci.rules',{n:i.highlightRules}));
 if(i.note)lines.push(t(i.note==='comment'?'sheets.ci.comment':'sheets.ci.note'));
 if(i.link)lines.push(t('sheets.ci.link',{target:i.link}));
 if(i.spill)lines.push(t('sheets.ci.spill',{range:i.spill.range,anchor:i.spill.anchor}));
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.ci.title')}>
  <span>{t('sheets.ci.title',{cell:i.address})}</span>
  <ul data-testid="sheets-ci-list">{lines.map((l,n)=><li key={n}>{l}</li>)}</ul>
 </div>;
}
/** Where the printed pages of this sheet start and end, from the engine's print layout. Jump to the first cell of any page. Reads only. */
function PageBreaksGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [pick,setPick]=useState(0);
 if(!s)return null;
 const list=s.pageList??null,chosen=list?.pages[pick]??list?.pages[0]??null;
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.pb.title')}>
  <span>{t('sheets.pb.title')}</span>
  <div className="flex gap-2">
   <Button variant="outline" size="compact" disabled={action.busy} onClick={()=>void action.run('sheets.pages',{kind:'show'})} data-testid="sheets-pb-show">{t('sheets.pb.show')}</Button>
   {list&&<Button variant="outline" size="compact" disabled={action.busy} onClick={()=>void action.run('sheets.pages',{kind:'clear'})} data-testid="sheets-pb-clear">{t('sheets.pb.clear')}</Button>}
  </div>
  {list&&<p data-testid="sheets-pb-count">{list.total===0?t('sheets.pb.none'):t('sheets.pb.count',{n:list.total})+(list.total>list.pages.length?' '+t('sheets.pb.truncated'):'')}</p>}
  {list&&list.pages.length>0&&<>
   <label className="flex flex-col gap-1">{t('sheets.pb.page')}<NativeSelect className={field} value={chosen?list.pages.indexOf(chosen):0} disabled={action.busy} onChange={e=>setPick(Number(e.currentTarget.value))} data-testid="sheets-pb-page">{list.pages.map((p,n)=><option key={p.page} value={n}>{t('sheets.pb.item',{page:p.page,range:p.range})}</option>)}</NativeSelect></label>
   {chosen&&<p>{t('sheets.pb.detail',{rows:chosen.rows,columns:chosen.columns,scale:chosen.scale,paper:chosen.paper,orientation:t('sheets.pb.o.'+(chosen.orientation==='landscape'?'landscape':'portrait'))})}</p>}
   <Button variant="outline" size="compact" disabled={action.busy||!chosen} onClick={()=>{if(chosen)void action.run('sheets.navigate',{sheet:s.sheet,address:pageStart(chosen.range)});}} data-testid="sheets-pb-go">{t('sheets.pb.go')}</Button>
  </>}
  <p className="text-ink-3">{t('sheets.pb.hint')}</p>
  {action.notice?<p role="alert">{action.notice}</p>:null}
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
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [choice,setChoice]=useState<ValidationChoice>('list');const [operator,setOperator]=useState<CfOperator>('between');const [a,setA]=useState('');const [b,setB]=useState('');const [allowBlank,setAllowBlank]=useState(true);const [dropdown,setDropdown]=useState(true);const [alertStyle,setAlertStyle]=useState<'stop'|'warning'>('stop');const [errMsg,setErrMsg]=useState('');
 const r=s?.range;if(!s||!r)return null;
 const numeric=choice==='whole'||choice==='decimal'||choice==='length'||choice==='date'||choice==='time',two=numeric&&(operator==='between'||operator==='notBetween'),isList=choice==='list'||choice==='listRange',op=buildValidationOp(choice,operator,a,b,{allowBlank,dropdown,errorStyle:alertStyle,errorMessage:errMsg});
 const rule=s.validationRule,bad=s.invalidCells;
 const run=(o:object)=>void action.run('sheets.validation',o);
 const items=s.listItems;
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.dv.title')}>
  <span>{t('sheets.dv.title')}</span>
  {items&&items.length>0&&<label className="flex flex-col gap-1">{t('sheets.dv.pick')}<NativeSelect className={field} value="" disabled={action.busy} onChange={e=>{const v=e.currentTarget.value;if(v)void action.run('sheets.setCell',{input:v});}} data-testid="sheets-dv-pick"><option value="">{t('sheets.dv.pickNone')}</option>{items.map(i=><option key={i} value={i}>{i}</option>)}</NativeSelect></label>}
  <label className="flex flex-col gap-1">{t('sheets.dv.allow')}<NativeSelect className={field} value={choice} disabled={action.busy} onChange={e=>setChoice(e.currentTarget.value as ValidationChoice)} data-testid="sheets-dv-kind">{VALIDATION_CHOICES.map(c=><option key={c} value={c}>{t('sheets.dv.kind.'+c)}</option>)}</NativeSelect></label>
  {numeric&&<label className="flex flex-col gap-1">{t('sheets.dv.operator')}<NativeSelect className={field} value={operator} disabled={action.busy} onChange={e=>setOperator(e.currentTarget.value as CfOperator)} data-testid="sheets-dv-operator">{VALIDATION_OPERATORS.map(c=><option key={c} value={c}>{t('sheets.dv.op.'+c)}</option>)}</NativeSelect></label>}
  <label className="flex flex-col gap-1">{t(choice==='list'?'sheets.dv.items':choice==='listRange'?'sheets.dv.source':choice==='date'?'sheets.dv.valueDate':choice==='time'?'sheets.dv.valueTime':'sheets.dv.value')}<NativeInput className={field} value={a} maxLength={choice==='list'?MAX_ITEM_CHARS*20:32} disabled={action.busy} onChange={e=>setA(e.currentTarget.value)} data-testid="sheets-dv-value"/></label>
  {two&&<label className="flex flex-col gap-1">{t('sheets.dv.value2')}<NativeInput className={field} value={b} maxLength={32} disabled={action.busy} onChange={e=>setB(e.currentTarget.value)} data-testid="sheets-dv-value2"/></label>}
  <label className="flex flex-col gap-1">{t('sheets.dv.alert')}<NativeSelect className={field} value={alertStyle} disabled={action.busy} onChange={e=>setAlertStyle(e.currentTarget.value==='warning'?'warning':'stop')} data-testid="sheets-dv-alert"><option value="stop">{t('sheets.dv.alert.stop')}</option><option value="warning">{t('sheets.dv.alert.warning')}</option></NativeSelect></label>
  <label className="flex flex-col gap-1">{t('sheets.dv.errorMessage')}<NativeInput className={field} value={errMsg} maxLength={255} disabled={action.busy} onChange={e=>setErrMsg(e.currentTarget.value)} data-testid="sheets-dv-message"/></label>
  <Checkbox label={t('sheets.dv.allowBlank')} checked={allowBlank} disabled={action.busy} onChange={e=>setAllowBlank(e.currentTarget.checked)}/>
  {isList&&<Checkbox label={t('sheets.dv.dropdown')} checked={dropdown} disabled={action.busy} onChange={e=>setDropdown(e.currentTarget.checked)}/>}
  <div className="flex flex-wrap gap-2">
   <Button variant="outline" size="compact" disabled={action.busy||!op} onClick={()=>op&&run(op)} data-testid="sheets-dv-apply">{t('sheets.dv.apply')}</Button>
   <Button variant="outline" size="compact" disabled={action.busy} onClick={()=>run({kind:'clear'})} data-testid="sheets-dv-clear">{t('sheets.dv.clear')}</Button>
   <Button variant="outline" size="compact" disabled={action.busy} onClick={()=>void action.run('sheets.validationCheck',{})} data-testid="sheets-dv-check">{t('sheets.dv.check')}</Button>
  </div>
  {rule&&<p className="text-ink-3">{t('sheets.dv.current',{kind:t('sheets.dv.rk.'+rule.kind),op:rule.kind==='List'||rule.kind==='Custom'?rule.f1:t('sheets.dv.op.'+rule.operator.charAt(0).toLowerCase()+rule.operator.slice(1))+' '+rule.f1+(rule.f2?' / '+rule.f2:''),alert:t('sheets.dv.alert.'+(rule.errorStyle==='Stop'?'stop':'warning'))})}</p>}
  {bad&&<p className="text-ink-3">{bad.cells.length===0?t('sheets.dv.allGood'):t('sheets.dv.found',{count:bad.cells.length+(bad.truncated?'+':''),cells:bad.cells.slice(0,20).join(', ')})}</p>}
  <p className="text-ink-3">{t('sheets.dv.scope',{range:rangeAddress(r)})}</p>
 </div>;
}
/** Highlights cells of the selected block by a rule or a color scale. One undo step; rules can be cleared for the block or the sheet. */
function HighlightGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [choice,setChoice]=useState<CfChoice>('greater');const [a,setA]=useState('');const [b,setB]=useState('');const [style,setStyle]=useState<CfStyle>('lightRed');
 const r=s?.range;if(!s||!r)return null;
 const cells=(r.r1-r.r0+1)*(r.c1-r.c0+1),need=cfChoiceNeeds(choice),op=buildCfOp(choice,a,b,style,cells),scale=cfChoiceIsVisual(choice);
 const run=(o:object)=>void action.run('sheets.highlight',o);
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.hl.title')}>
  <span>{t('sheets.hl.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.hl.rule')}<NativeSelect className={field} value={choice} disabled={action.busy} onChange={e=>setChoice(e.currentTarget.value as CfChoice)} data-testid="sheets-hl-rule">{CF_CHOICE_GROUPS.map(([g,list])=><optgroup key={g} label={t('sheets.hl.group.'+g)}>{list.map(c=><option key={c} value={c}>{t('sheets.hl.rule.'+c)}</option>)}</optgroup>)}</NativeSelect></label>
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
/** The highlight rules of this sheet in priority order: move one to the top, up, down or bottom, or delete it. One undo step each. Shown only when the sheet has rules. */
const CF_MANAGE_ACTIONS=['moveTop','moveUp','moveDown','moveBottom','delete'] as const;
function CfRulesGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [pick,setPick]=useState(0);const [act,setAct]=useState<(typeof CF_MANAGE_ACTIONS)[number]>('moveTop');
 const rules=s?.cfRules??[];if(!s||rules.length===0)return null;
 const chosen=rules.find(x=>x.index===pick)??rules[0],last=rules.length-1;
 const blocked=(act==='moveTop'||act==='moveUp')?chosen.index===0:(act==='moveDown'||act==='moveBottom')?chosen.index===last:false;
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.cm.title')}>
  <span>{t('sheets.cm.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.cm.rule')}<NativeSelect className={field} value={chosen.index} disabled={action.busy} onChange={e=>setPick(Number(e.currentTarget.value))} data-testid="sheets-cm-rule">{rules.map(x=><option key={x.index} value={x.index}>{(x.index+1)+'. '+describeCfRule(x,k=>t('sheets.cm.kind.'+k))+(x.stop?' · '+t('sheets.cm.stop'):'')}</option>)}</NativeSelect></label>
  <label className="flex flex-col gap-1">{t('sheets.cm.action')}<NativeSelect className={field} value={act} disabled={action.busy} onChange={e=>setAct(e.currentTarget.value as (typeof CF_MANAGE_ACTIONS)[number])} data-testid="sheets-cm-action">{CF_MANAGE_ACTIONS.map(a=><option key={a} value={a}>{t('sheets.cm.'+a)}</option>)}</NativeSelect></label>
  <Button variant="outline" size="compact" disabled={action.busy||blocked} onClick={()=>void action.run('sheets.cfManage',{kind:act,index:chosen.index})} data-testid="sheets-cm-apply">{t('sheets.cm.apply')}</Button>
  <p className="text-ink-3">{t('sheets.cm.hint',{count:rules.length})}</p>
 </div>;
}
/** The data validation rules of this sheet: jump to the first range of one, or delete it (cells keep their values). One undo step for a delete. Shown only when the sheet has rules. */
function ValidationRulesGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction();const [pick,setPick]=useState(0);const [act,setAct]=useState<'go'|'delete'>('go');
 const rules=s?.validationRules??[];if(!s||rules.length===0)return null;
 const chosen=rules.find(x=>x.index===pick)??rules[0],first=chosen.ranges[0];
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.vm.title')}>
  <span>{t('sheets.vm.title')}</span>
  <label className="flex flex-col gap-1">{t('sheets.vm.rule')}<NativeSelect className={field} value={chosen.index} disabled={action.busy} onChange={e=>setPick(Number(e.currentTarget.value))} data-testid="sheets-vm-rule">{rules.map(x=><option key={x.index} value={x.index}>{(x.index+1)+'. '+describeValidationRule(x,k=>t('sheets.vm.kind.'+k))}</option>)}</NativeSelect></label>
  <label className="flex flex-col gap-1">{t('sheets.vm.action')}<NativeSelect className={field} value={act} disabled={action.busy} onChange={e=>setAct(e.currentTarget.value as 'go'|'delete')} data-testid="sheets-vm-action"><option value="go">{t('sheets.vm.go')}</option><option value="delete">{t('sheets.vm.delete')}</option></NativeSelect></label>
  <Button variant="outline" size="compact" disabled={action.busy||(act==='go'&&!first)} onClick={()=>void(act==='go'?action.run('sheets.navigate',{sheet:s.sheet,address:first}):action.run('sheets.validationManage',{kind:'delete',index:chosen.index}))} data-testid="sheets-vm-apply">{t('sheets.vm.apply')}</Button>
  <p className="text-ink-3">{t('sheets.vm.hint',{count:rules.length})}</p>
 </div>;
}
/** Fills the selected block from its first row or column. One undo step; the block is never widened. */
function FillGroup(){
 const {t}=useT(),s=useSheetsSelection(),action=useAction(),mode=useFillMode();const [kind,setKind]=useState<SeriesKind>('linear'),[stepText,setStepText]=useState('1'),[stopText,setStopText]=useState('');
 const r=s?.range;if(!s||!r)return null;
 const rows=r.r1-r.r0+1,cols=r.c1-r.c0+1;
 const num=(x:string)=>Number(x.trim().replace(',','.')),seriesOp=buildSeriesOp(rows,cols,kind,stepText.trim()===''?NaN:num(stepText),stopText.trim()===''?null:num(stopText));
 return <div className="flex flex-col gap-2 border-t border-subtle pt-3" role="group" aria-label={t('sheets.fill.title')}>
  <span>{t('sheets.fill.title')}</span>
  <div className="flex flex-wrap gap-2">
   {FILL_DIRECTIONS.map((d:FillDirection)=><Button key={d} variant="outline" size="compact" disabled={action.busy||!!fillBlockProblem(r.r0,r.c0,rows,cols,d)} onClick={()=>void action.run('sheets.fill',{dir:d})} data-testid={'sheets-fill-'+d}>{t('sheets.fill.'+d)}</Button>)}
  </div>
  <label className="flex flex-col gap-1">{t('sheets.fill.mode')}<NativeSelect className={field} value={mode} onChange={e=>setFillMode(e.currentTarget.value as AutoFillMode)} data-testid="sheets-fill-mode">{AUTOFILL_MODES.map(m=><option key={m} value={m}>{t('sheets.fill.mode.'+m)}</option>)}</NativeSelect></label>
  <p className="text-ink-3">{t('sheets.fill.scope',{range:rangeAddress(r)})}</p>
  <label className="flex flex-col gap-1">{t('sheets.fill.series')}<NativeSelect className={field} value={kind} onChange={e=>setKind(e.currentTarget.value as SeriesKind)} data-testid="sheets-series-kind">{SERIES_KINDS.map(k=><option key={k} value={k}>{t('sheets.fill.series.'+k)}</option>)}</NativeSelect></label>
  <div className="flex gap-2">
   <label className="flex min-w-0 flex-1 flex-col gap-1">{t('sheets.fill.step')}<NativeInput className={field} value={stepText} inputMode="decimal" maxLength={16} onChange={e=>setStepText(e.currentTarget.value)} data-testid="sheets-series-step"/></label>
   <label className="flex min-w-0 flex-1 flex-col gap-1">{t('sheets.fill.stop')}<NativeInput className={field} value={stopText} inputMode="decimal" maxLength={16} placeholder={t('sheets.fill.stopNone')} onChange={e=>setStopText(e.currentTarget.value)} data-testid="sheets-series-stop"/></label>
  </div>
  <Button variant="outline" size="compact" disabled={action.busy||typeof seriesOp==='string'} onClick={()=>{if(typeof seriesOp!=='string')void action.run('sheets.series',seriesOp);}} data-testid="sheets-series-apply">{t('sheets.fill.seriesApply')}</Button>
  {typeof seriesOp==='string'&&<p className="text-ink-3">{t('sheets.fill.problem.'+seriesOp)}</p>}
 </div>;
}
export function SheetsLayoutSection({sectionId,context}:InspectorSectionProps){return <SheetsLayoutPanel panelId={sectionId} context={context}/>;}
