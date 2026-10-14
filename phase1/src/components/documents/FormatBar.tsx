import {useEffect,useMemo,useState} from 'react';
import {useDocuments} from '../../lib/documents/store';
import {customParagraphStyles,useStyleList} from '../../lib/documents/styles';
import {TableSizeDialog} from './TableSizeDialog';
import {HeaderFooterDialog} from './HeaderFooterDialog';
import {ImageControls} from './ImageControls';
import {TableStyleDialog} from './TableStyleDialog';
import {PageSetupDialog} from './PageSetupDialog';
import {GoToPageDialog} from './GoToPageDialog';
import {TextEffects} from './TextEffects';
import {setCommentsOpen,useCommentsOpen} from '../../lib/documents/comments';
import {DOC_COLORS} from '../../lib/documents/palette';
import {FONT_SIZES,setAlign,setFont,setFontColor,setFontSize,setLineSpacing,setSpaceAfter,setParagraphStyle,setSpaceBefore,stepIndent,toggleFormat,toggleList,shiftListLevel,refreshStyles,setListStyle,restartNumbering,continueNumbering,editTable,insertTable,setColumnWidth} from '../../lib/documents/session';
import {LIST_STYLES,type ListStyleId,MIN_COL_PT,MAX_COL_PT,TABLE_PRESETS,TABLE_OPS,type TableOp,DOC_STYLES,type DocStyleId,type FormatPatch,type FormatState,type ParaAlign,type ParaState} from '../../lib/documents/protocol';
import {AlignCenter,AlignJustify,AlignLeft,AlignRight,IndentDecrease,IndentIncrease,ListBullet,ListNumbered} from '../../lib/icons';
import {t} from '../../lib/i18n';
import {NativeButton,NativeInput,NativeSelect} from '../ui/native-controls';

/** Families the engine bundles and can really draw, so a choice always renders as shown. */
export const DOC_FONTS=['Source Sans 3','Source Serif 4','Inter','JetBrains Mono'] as const;
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border-0 bg-transparent px-2 text-xs text-ink-2 hover:bg-hover aria-pressed:bg-hover aria-pressed:text-ink disabled:cursor-default disabled:opacity-50';
const sel='h-7 rounded-sm border border-subtle bg-surface px-1 text-xs text-ink disabled:opacity-50';

/** Toolbar row for character formatting. A held format at a collapsed caret overrides what the engine reports. */
const ALIGNS:readonly (readonly [ParaAlign,typeof AlignLeft])[]=[['left',AlignLeft],['center',AlignCenter],['right',AlignRight],['justify',AlignJustify]];
const LINE_STEPS=[1,1.15,1.5,2,2.5,3] as const;
const SPACE_STEPS=[0,4,6,8,10,12,18,24] as const;
const withCurrent=(list:readonly number[],cur:number|null)=>cur!==null&&!list.includes(cur)?[...list,cur].sort((a,b)=>a-b):[...list];

export function FormatBar({format,held,para,enabled,inCell=false}:{format:FormatState|null;held:FormatPatch|null;para:ParaState|null;enabled:boolean;inCell?:boolean}){
 const commentsOpen=useCommentsOpen();const docState=useDocuments();const styles=useStyleList();const customStyles=customParagraphStyles(styles);
 useEffect(()=>{if(docState.status==='ready')void refreshStyles();},[docState.status,docState.name,docState.rev]);
 const styleKnown=!!para?.style&&((DOC_STYLES as readonly string[]).includes(para.style)||customStyles.some(s=>s.id===para.style));
 const [sizeOpen,setSizeOpen]=useState(false),[hfOpen,setHfOpen]=useState(false),[colW,setColW]=useState(''),[styleOpen,setStyleOpen]=useState(false),[pageOpen,setPageOpen]=useState(false),[gotoOpen,setGotoOpen]=useState(false);
 const colOk=/^\d+(\.\d+)?$/.test(colW)&&Number(colW)>=MIN_COL_PT&&Number(colW)<=MAX_COL_PT;
 const flag=(p:'bold'|'italic'|'underline')=>held?.[p]??format?.[p]==='on';
 const font=held?.font??format?.font??'';const size=held?.size??format?.size??null;const color=held?.color??format?.color??null;
 const fonts=useMemo(()=>font&&!(DOC_FONTS as readonly string[]).includes(font)?[font,...DOC_FONTS]:[...DOC_FONTS],[font]);
 const sizes=useMemo(()=>size!==null&&!(FONT_SIZES as readonly number[]).includes(size)?[...FONT_SIZES,size].sort((a,b)=>a-b):[...FONT_SIZES],[size]);
 const lines=withCurrent(LINE_STEPS,para?.lineSpacing??null),before=withCurrent(SPACE_STEPS,para?.spaceBefore??null),after=withCurrent(SPACE_STEPS,para?.spaceAfter??null);
 const num=(v:number|null|undefined)=>v==null?'':String(v);
 return <div role="toolbar" aria-label={t('documents.format.toolbar')} className="media-bar flex flex-wrap items-center gap-2 border-b border-subtle px-3 py-1" data-testid="documents-format-bar">
  <NativeSelect className={sel+' w-36'} aria-label={t('documents.format.font')} title={t('documents.format.font')} disabled={!enabled} value={font} onChange={e=>void setFont(e.currentTarget.value)} data-testid="documents-format-font">
   {!font&&<option value="" disabled>{t('documents.format.mixed')}</option>}{fonts.map(f=><option key={f} value={f}>{f}</option>)}</NativeSelect>
  <NativeSelect className={sel+' w-16 tabular-nums'} aria-label={t('documents.format.size')} title={t('documents.format.size')} disabled={!enabled} value={size===null?'':String(size)} onChange={e=>void setFontSize(Number(e.currentTarget.value))} data-testid="documents-format-size">
   {size===null&&<option value="" disabled>{'–'}</option>}{sizes.map(s=><option key={s} value={String(s)}>{s}</option>)}</NativeSelect>
  {(['bold','italic','underline'] as const).map(p=><NativeButton key={p} className={tool+' w-6'} aria-label={t('documents.format.'+p)} title={t('documents.format.'+p)} aria-pressed={flag(p)} disabled={!enabled} onClick={()=>void toggleFormat(p)} data-testid={'documents-format-'+p}><span className={p==='bold'?'font-bold':p==='italic'?'italic':'underline'}>{p==='bold'?'B':p==='italic'?'I':'U'}</span></NativeButton>)}
  <TextEffects format={format} held={held} enabled={enabled}/>
  <span className="flex items-center gap-1" role="group" aria-label={t('documents.format.color')}>
   <NativeButton className={tool} aria-pressed={color==='auto'} disabled={!enabled} onClick={()=>void setFontColor('auto')} data-testid="documents-color-auto">{t('documents.format.colorAuto')}</NativeButton>
   {DOC_COLORS.map(([h,cls])=><NativeButton key={h} className={'h-5 w-5 cursor-pointer rounded-sm border disabled:cursor-default disabled:opacity-50 '+cls+' '+(color?.toUpperCase()===h?'border-ink':'border-subtle')} aria-label={t('documents.format.colorOne',{hex:'#'+h})} title={'#'+h} aria-pressed={color?.toUpperCase()===h} disabled={!enabled} onClick={()=>void setFontColor(h)} data-testid={'documents-color-'+h}/>)}
  </span>
  <NativeSelect className={sel+' w-32'} aria-label={t('documents.style.label')} title={t('documents.style.label')} disabled={!enabled} value={styleKnown?para!.style!:''} onChange={e=>void setParagraphStyle(e.currentTarget.value)} data-testid="documents-style">
   {!styleKnown&&<option value="" disabled>{para?.style??t('documents.format.mixed')}</option>}{DOC_STYLES.map(s=><option key={s} value={s}>{t('documents.style.'+s)}</option>)}{customStyles.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect>
  <span className="flex items-center gap-0.5" role="group" aria-label={t('documents.para.align')}>
   {ALIGNS.map(([a,Icon])=><NativeButton key={a} className={tool+' w-7 px-0'} aria-label={t('documents.para.align.'+a)} title={t('documents.para.align.'+a)} aria-pressed={para?.align===a} disabled={!enabled} onClick={()=>void setAlign(a)} data-testid={'documents-align-'+a}><Icon size={14}/></NativeButton>)}
   <NativeButton className={tool+' w-7 px-0'} aria-label={t('documents.para.indent.decrease')} title={t('documents.para.indent.decrease')} disabled={!enabled||para?.indentLeft===0} onClick={()=>void stepIndent(-1)} data-testid="documents-indent-decrease"><IndentDecrease size={14}/></NativeButton>
   <NativeButton className={tool+' w-7 px-0'} aria-label={t('documents.para.indent.increase')} title={t('documents.para.indent.increase')} disabled={!enabled} onClick={()=>void stepIndent(1)} data-testid="documents-indent-increase"><IndentIncrease size={14}/></NativeButton>
  </span>
  <span className="flex items-center gap-0.5" role="group" aria-label={t('documents.list.label')}>
   <NativeButton className={tool+' w-7 px-0'} aria-label={t('documents.list.bullet')} title={t('documents.list.bullet')} aria-pressed={para?.list==='bullet'} disabled={!enabled} onClick={()=>void toggleList('bullet')} data-testid="documents-list-bullet"><ListBullet size={14}/></NativeButton>
   <NativeButton className={tool+' w-7 px-0'} aria-label={t('documents.list.numbered')} title={t('documents.list.numbered')} aria-pressed={para?.list==='numbered'} disabled={!enabled} onClick={()=>void toggleList('numbered')} data-testid="documents-list-numbered"><ListNumbered size={14}/></NativeButton>
   <NativeSelect className={sel+' w-28'} aria-label={t('documents.list.styleLabel')} title={t('documents.list.styleLabel')} disabled={!enabled} value={para?.listStyle&&para.listStyle!=='none'?para.listStyle:''} onChange={e=>{const v=e.currentTarget.value;if((LIST_STYLES as readonly string[]).includes(v))void setListStyle(v as ListStyleId);}} data-testid="documents-list-style">
    <option value="" disabled>{t('documents.list.styleLabel')}</option>{para?.listStyle==='other'&&<option value="other" disabled>{t('documents.list.style.other')}</option>}{LIST_STYLES.map(k=><option key={k} value={k}>{t('documents.list.style.'+k)}</option>)}</NativeSelect>
   {para?.list==='numbered'&&<NativeButton className={tool} disabled={!enabled} onClick={()=>void restartNumbering()} data-testid="documents-list-restart">{t('documents.list.restart')}</NativeButton>}
   {para?.list==='numbered'&&<NativeButton className={tool} disabled={!enabled} onClick={()=>void continueNumbering()} data-testid="documents-list-continue">{t('documents.list.continue')}</NativeButton>}
   {(para?.list==='bullet'||para?.list==='numbered')&&<><NativeButton className={tool+' w-7 px-0'} aria-label={t('documents.list.promote')} title={t('documents.list.promote')} disabled={!enabled} onClick={()=>void shiftListLevel(-1)} data-testid="documents-list-promote">{'\u2190'}</NativeButton>
   <NativeButton className={tool+' w-7 px-0'} aria-label={t('documents.list.demote')} title={t('documents.list.demote')} disabled={!enabled} onClick={()=>void shiftListLevel(1)} data-testid="documents-list-demote">{'\u2192'}</NativeButton></>}
  </span>
  <NativeSelect className={sel+' w-28'} aria-label={t('documents.table.insert')} title={t('documents.table.insert')} disabled={!enabled} value="" onChange={e=>{const v=e.currentTarget.value;e.currentTarget.value='';if(v==='custom'){setSizeOpen(true);return;}const [r,c]=v.split('x').map(Number);if(TABLE_PRESETS.some(p=>p[0]===r&&p[1]===c))void insertTable(r,c);}} data-testid="documents-table-insert">
   <option value="" disabled>{t('documents.table.insert')}</option>{TABLE_PRESETS.map(([r,c])=><option key={r+'x'+c} value={r+'x'+c}>{r+' × '+c}</option>)}<option value="custom">{t('documents.table.custom')}</option></NativeSelect>
  {sizeOpen&&<TableSizeDialog onClose={()=>setSizeOpen(false)}/>}
  <NativeButton className={tool+' border border-subtle'} disabled={!enabled} onClick={()=>setHfOpen(true)} data-testid="documents-hf-open">{t('documents.hf.title')}</NativeButton>
  {hfOpen&&<HeaderFooterDialog onClose={()=>setHfOpen(false)}/>}
  <NativeButton className={tool+' border border-subtle'} disabled={!enabled} onClick={()=>setPageOpen(true)} data-testid="documents-page-open">{t('documents.page.title')}</NativeButton>
  {pageOpen&&<PageSetupDialog onClose={()=>setPageOpen(false)}/>}
  <NativeButton className={tool+' border border-subtle'} aria-pressed={commentsOpen} onClick={()=>setCommentsOpen(!commentsOpen)} data-testid="documents-comments-toggle">{t('documents.comments.title')}</NativeButton>
  <NativeButton className={tool+' border border-subtle'} onClick={()=>setGotoOpen(true)} data-testid="documents-goto-open">{t('documents.goto.title')}</NativeButton>
  {gotoOpen&&<GoToPageDialog onClose={()=>setGotoOpen(false)}/>}
  <ImageControls/>
  {inCell&&<NativeSelect className={sel+' w-28'} aria-label={t('documents.table.label')} title={t('documents.table.label')} disabled={!enabled} value="" onChange={e=>{const op=e.currentTarget.value as TableOp;e.currentTarget.value='';if((TABLE_OPS as readonly string[]).includes(op))void editTable(op);}} data-testid="documents-table-menu">
   <option value="" disabled>{t('documents.table.label')}</option>{TABLE_OPS.map(o=><option key={o} value={o} data-testid={'documents-table-'+o}>{t('documents.table.'+o)}</option>)}</NativeSelect>}
  {inCell&&<NativeButton className={tool+' border border-subtle'} disabled={!enabled} onClick={()=>setStyleOpen(true)} data-testid="documents-table-style-open">{t('documents.tableStyle.title')}</NativeButton>}
  {styleOpen&&<TableStyleDialog onClose={()=>setStyleOpen(false)}/>}
  {inCell&&<span className="flex items-center gap-1"><NativeInput type="number" min={MIN_COL_PT} max={MAX_COL_PT} step={1} className={sel+' w-20 tabular-nums'} aria-label={t('documents.table.colWidth')} title={t('documents.table.colWidth')} placeholder={t('documents.table.colWidth')} value={colW} disabled={!enabled} onChange={e=>setColW(e.currentTarget.value)} onKeyDown={e=>{if(e.key==='Enter'&&colOk)void setColumnWidth(Number(colW));}} data-testid="documents-col-width"/>
   <NativeButton className={tool+' border border-subtle'} disabled={!enabled||!colOk} onClick={()=>void setColumnWidth(Number(colW))} data-testid="documents-col-width-set">{t('documents.table.colWidthSet')}</NativeButton></span>}
  <NativeSelect className={sel+' w-16 tabular-nums'} aria-label={t('documents.para.lineSpacing')} title={t('documents.para.lineSpacing')} disabled={!enabled} value={num(para?.lineSpacing)} onChange={e=>void setLineSpacing(Number(e.currentTarget.value))} data-testid="documents-line-spacing">
   {para?.lineSpacing==null&&<option value="" disabled>{'–'}</option>}{lines.map(s=><option key={s} value={String(s)}>{s}</option>)}</NativeSelect>
  <NativeSelect className={sel+' w-16 tabular-nums'} aria-label={t('documents.para.spaceBefore')} title={t('documents.para.spaceBefore')} disabled={!enabled} value={num(para?.spaceBefore)} onChange={e=>void setSpaceBefore(Number(e.currentTarget.value))} data-testid="documents-space-before">
   {para?.spaceBefore==null&&<option value="" disabled>{'–'}</option>}{before.map(s=><option key={s} value={String(s)}>{s}</option>)}</NativeSelect>
  <NativeSelect className={sel+' w-16 tabular-nums'} aria-label={t('documents.para.spaceAfter')} title={t('documents.para.spaceAfter')} disabled={!enabled} value={num(para?.spaceAfter)} onChange={e=>void setSpaceAfter(Number(e.currentTarget.value))} data-testid="documents-space-after">
   {para?.spaceAfter==null&&<option value="" disabled>{'–'}</option>}{after.map(s=><option key={s} value={String(s)}>{s}</option>)}</NativeSelect>
 </div>;
}
