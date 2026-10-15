import {useEffect,useState} from 'react';
import {autoCorrectOn,setAutoCorrect} from '../../lib/documents/autocorrect';
import {executeCommand} from '../../lib/commands';
import {pickAndCompareText,pickAndInsertText} from '../../lib/documents/insertFromFile';
import {insertBlankPage,printCurrent,moveParagraphs,sortParagraphs,readParagraphSpacing,setParagraphSpacing,readBookmarks,setViewMarks,setTrackChanges,copyFormatting,pasteFormatting,setCharSpacing,insertPageBreak,clearFormatting,changeCase,hasTextSelection,setHighlight,setLink,toggleFormat,toggleVertAlign} from '../../lib/documents/session';
import {PARAGRAPH_SPACINGS,type ParagraphSpacing,HIGHLIGHTS,MAX_LINK_CHARS,linkProblem,type FormatPatch,type FormatState,type HighlightName} from '../../lib/documents/protocol';
import {CASE_MODES,type CaseMode} from '../../lib/documents/textCase';
import {setShortcutsOpen} from '../../lib/documents/shortcuts';
import {setInfoDialog} from '../../lib/documents/infoDialog';
import {setParagraphOptionsOpen} from '../../lib/documents/paragraphOptions';
import {useDocuments} from '../../lib/documents/store';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput,NativeSelect} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border-0 bg-transparent px-2 text-xs text-ink-2 hover:bg-hover aria-pressed:bg-hover aria-pressed:text-ink disabled:cursor-default disabled:opacity-50';
const sel='h-7 rounded-sm border border-subtle bg-surface px-1 text-xs text-ink disabled:opacity-50';
/** Link the selected text: http, https or mailto only. An empty address removes the link. */
export function LinkDialog({current,onClose}:{current:string;onClose:()=>void}){
 const {t}=useT();const [v,setV]=useState(current);const bad=v!==''&&linkProblem(v)!==null;
 const apply=(url:string)=>{if(linkProblem(url)!==null)return;onClose();void setLink(url);};
 const [marks,setMarks]=useState<string[]>([]);
 useEffect(()=>{let live=true;void readBookmarks().then(l=>{if(live&&l)setMarks(l.map(b=>b.name));}).catch(()=>undefined);return()=>{live=false;};},[]);
 return <div role="dialog" aria-modal="true" aria-labelledby="documents-link-title" className="fixed inset-0 z-20 grid place-items-center bg-black/30" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}if(e.key==='Enter'){e.preventDefault();apply(v);}}}>
  <div className="grid w-96 max-w-full gap-3 rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl" data-testid="documents-link-dialog">
   <h2 id="documents-link-title" className="text-sm font-medium">{t('documents.format.linkTitle')}</h2>
   <label className="grid gap-1 text-xs text-ink-2">{t('documents.format.linkUrl')}
    <NativeInput className="rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink" autoFocus maxLength={MAX_LINK_CHARS} value={v} placeholder="https://" aria-invalid={bad} onChange={e=>setV(e.currentTarget.value.trim())} data-testid="documents-link-input"/></label>
   {marks.length>0&&<label className="grid gap-1 text-xs text-ink-2">{t('documents.format.linkBookmark')}
    <NativeSelect className="h-7 rounded-sm border border-subtle bg-surface px-1 text-xs text-ink" value={marks.includes(v.slice(1))&&v.startsWith('#')?v.slice(1):''} onChange={e=>setV(e.currentTarget.value===''?'':'#'+e.currentTarget.value)} data-testid="documents-link-bookmark">
     <option value="">{t('documents.format.linkBookmarkNone')}</option>{marks.map(m=><option key={m} value={m}>{m}</option>)}</NativeSelect></label>}
   <div className="flex justify-end gap-2">
    {current!==''&&<NativeButton className={tool+' border border-subtle'} onClick={()=>apply('')} data-testid="documents-link-remove">{t('documents.format.linkRemove')}</NativeButton>}
    <NativeButton className={tool+' border border-subtle'} disabled={v===''||bad} onClick={()=>apply(v)} data-testid="documents-link-apply">{t('documents.format.linkApply')}</NativeButton></div>
  </div>
 </div>;
}
/** Document-wide paragraph spacing presets. */
function SpacingSelect({enabled}:{enabled:boolean}){
 const {t}=useT();const doc=useDocuments();const [v,setV]=useState<string|null>(null);
 useEffect(()=>{let live=true;void readParagraphSpacing().then(r=>{if(live)setV(r);}).catch(()=>undefined);return()=>{live=false;};},[doc.rev]);
 return <NativeSelect className={sel} disabled={!enabled||v===null} aria-label={t('documents.spacing.label')} title={t('documents.spacing.label')} value={v??'default'} onChange={e=>void setParagraphSpacing(e.currentTarget.value as ParagraphSpacing)} data-testid="documents-spacing">
  {v==='custom'&&<option value="custom" disabled>{t('documents.spacing.custom')}</option>}
  {PARAGRAPH_SPACINGS.map(k=><option key={k} value={k}>{t('documents.spacing.'+k)}</option>)}</NativeSelect>;
}
/** A drop-down of actions: choosing an entry runs it and the menu stays on its title. Keeps the bar short. */
function ActionMenu({label,items,testId}:{label:string;testId:string;items:{id:string;label:string;enabled:boolean;run:()=>void}[]}){
 return <NativeSelect className={sel+' w-24'} aria-label={label} title={label} value="" onChange={e=>{const it=items.find(x=>x.id===e.currentTarget.value);e.currentTarget.value='';if(it&&it.enabled)it.run();}} data-testid={testId}>
  <option value="" disabled>{label}</option>{items.map(i=><option key={i.id} value={i.id} disabled={!i.enabled}>{i.label}</option>)}</NativeSelect>;
}
const SPACINGS=[-1,-0.5,0,0.5,1,2,3];
/** Strikethrough, small caps, superscript, subscript, highlight, link and clear-formatting controls. */
export function TextEffects({format,held,enabled}:{format:FormatState|null;held:FormatPatch|null;enabled:boolean}){
 const {t}=useT();const doc=useDocuments();const [linkOpen,setLinkOpen]=useState(false);const [ac,setAc]=useState(autoCorrectOn);
 const on=(p:'strike'|'smallCaps'|'allCaps'|'doubleStrike')=>held?.[p]??format?.[p]==='on';
 const spacing=held?.spacing??format?.spacing;
 const vert=held?.vertAlign??format?.vertAlign??null;const hl=held?.highlight??format?.highlight??null;
 const picked=hasTextSelection();
 return <>
  <NativeButton className={tool+' w-6 border border-subtle'} aria-label={t('documents.format.strike')} title={t('documents.format.strike')+' (Ctrl+Shift+X)'} aria-pressed={on('strike')} disabled={!enabled} onClick={()=>void toggleFormat('strike')} data-testid="documents-format-strike"><span className="line-through">S</span></NativeButton>
  <NativeButton className={tool+' w-6 border border-subtle'} aria-label={t('documents.format.smallCaps')} title={t('documents.format.smallCaps')} aria-pressed={on('smallCaps')} disabled={!enabled} onClick={()=>void toggleFormat('smallCaps')} data-testid="documents-format-smallcaps"><span>{'Aa'}</span></NativeButton>
  <NativeButton className={tool+' w-6 border border-subtle'} aria-label={t('documents.format.allCaps')} title={t('documents.format.allCaps')} aria-pressed={on('allCaps')} disabled={!enabled} onClick={()=>void toggleFormat('allCaps')} data-testid="documents-format-allcaps"><span>{'AA'}</span></NativeButton>
  <NativeButton className={tool+' w-6 border border-subtle'} aria-label={t('documents.format.doubleStrike')} title={t('documents.format.doubleStrike')} aria-pressed={on('doubleStrike')} disabled={!enabled} onClick={()=>void toggleFormat('doubleStrike')} data-testid="documents-format-doublestrike"><span className="line-through">{'D'}</span></NativeButton>
  <NativeSelect className={sel+' w-24'} aria-label={t('documents.format.spacing')} title={t('documents.format.spacing')} disabled={!enabled} value={spacing===null||spacing===undefined?'':String(spacing)} onChange={e=>{const n=Number(e.currentTarget.value);if(SPACINGS.includes(n))void setCharSpacing(n);}} data-testid="documents-format-spacing">
   {(spacing===null||spacing===undefined||!SPACINGS.includes(spacing))&&<option value="" disabled>{t('documents.format.spacing')}</option>}
   {SPACINGS.map(n=><option key={n} value={String(n)}>{n===0?t('documents.format.spacing.normal'):(n>0?'+':'')+n+' pt'}</option>)}</NativeSelect>
  <NativeButton className={tool+' w-6 border border-subtle'} aria-label={t('documents.format.superscript')} title={t('documents.format.superscript')+' (Ctrl+Shift+=)'} aria-pressed={vert==='superscript'} disabled={!enabled} onClick={()=>void toggleVertAlign('superscript')} data-testid="documents-format-superscript"><span>{'x\u00b2'}</span></NativeButton>
  <NativeButton className={tool+' w-6 border border-subtle'} aria-label={t('documents.format.subscript')} title={t('documents.format.subscript')+' (Ctrl+=)'} aria-pressed={vert==='subscript'} disabled={!enabled} onClick={()=>void toggleVertAlign('subscript')} data-testid="documents-format-subscript"><span>{'x\u2082'}</span></NativeButton>
  <NativeSelect className={sel+' w-24'} aria-label={t('documents.format.case')} title={t('documents.format.case')} disabled={!enabled} value="" onChange={e=>{const m=e.currentTarget.value;if((CASE_MODES as readonly string[]).includes(m))void changeCase(m as CaseMode);}} data-testid="documents-format-case">
   <option value="" disabled>{t('documents.format.case')}</option>{CASE_MODES.map(m=><option key={m} value={m}>{t('documents.format.case.'+m)}</option>)}</NativeSelect>
  <NativeSelect className={sel+' w-28'} aria-label={t('documents.format.highlight')} title={t('documents.format.highlight')} disabled={!enabled} value={hl??''} onChange={e=>void setHighlight(e.currentTarget.value as HighlightName)} data-testid="documents-format-highlight">
   {hl===null&&<option value="" disabled>{t('documents.format.highlight')}</option>}{hl==='other'&&<option value="other" disabled>{t('documents.format.other')}</option>}
   {HIGHLIGHTS.map(h=><option key={h} value={h}>{t(h==='none'?'documents.format.hl.none':'documents.format.hl.'+h)}</option>)}</NativeSelect>
  <NativeButton className={tool+' border border-subtle'} aria-pressed={!!format?.link} title={t('documents.format.link')+' (Ctrl+K)'} disabled={!enabled||!picked} onClick={()=>setLinkOpen(true)} data-testid="documents-format-link">{t('documents.format.link')}</NativeButton>
  <NativeButton className={tool+' border border-subtle'} title={t('documents.painter.copy')} disabled={!enabled} onClick={()=>copyFormatting()} data-testid="documents-painter-copy">{t('documents.painter.copy')}</NativeButton>
  <NativeButton className={tool+' border border-subtle'} title={t('documents.painter.paste')} disabled={!enabled||!doc.painted} onClick={()=>void pasteFormatting()} data-testid="documents-painter-paste">{t('documents.painter.paste')}</NativeButton>
  <NativeButton className={tool+' border border-subtle'} title={t('documents.format.clear')+' (Ctrl+Space)'} disabled={!enabled||!picked} onClick={()=>void clearFormatting()} data-testid="documents-format-clear">{t('documents.format.clear')}</NativeButton>
  <SpacingSelect enabled={enabled}/>
  <ActionMenu label={t('documents.menu.format')} testId="documents-menu-format" items={[
   {id:'para',label:t('documents.para.opt.open'),enabled,run:()=>setParagraphOptionsOpen(true)},
   {id:'list',label:t('documents.listopt.open'),enabled:enabled&&(doc.para?.list==='bullet'||doc.para?.list==='numbered'),run:()=>setInfoDialog('list')},
   {id:'styles',label:t('documents.styles.open'),enabled,run:()=>setInfoDialog('styles')},
   {id:'charlook',label:t('documents.charlook.open'),enabled,run:()=>setInfoDialog('charlook')},
   {id:'tabs',label:t('documents.tabs.open'),enabled,run:()=>setInfoDialog('tabs')},
   {id:'moveUp',label:t('documents.paragraphs.moveUp'),enabled,run:()=>void moveParagraphs(-1)},
   {id:'moveDown',label:t('documents.paragraphs.moveDown'),enabled,run:()=>void moveParagraphs(1)},
   {id:'sortAsc',label:t('documents.sort.asc'),enabled,run:()=>void sortParagraphs(false)},
   {id:'sortDesc',label:t('documents.sort.desc'),enabled,run:()=>void sortParagraphs(true)}]}/>
  <ActionMenu label={t('documents.menu.insert')} testId="documents-menu-insert" items={[
   {id:'blankPage',label:t('documents.insert.blankPage'),enabled,run:()=>void insertBlankPage()},
   {id:'break',label:t('documents.para.opt.insertBreak'),enabled,run:()=>void insertPageBreak()},
   {id:'file',label:t('documents.insert.textFile'),enabled,run:()=>void pickAndInsertText()},
   {id:'symbol',label:t('documents.symbol.open'),enabled,run:()=>setInfoDialog('symbol')},
   {id:'cover',label:t('documents.cover.open'),enabled,run:()=>setInfoDialog('cover')},
   {id:'bookmarks',label:t('documents.bookmarks.open'),enabled,run:()=>setInfoDialog('bookmarks')},
   {id:'toc',label:t('documents.toc.open'),enabled,run:()=>setInfoDialog('toc')}]}/>
  <ActionMenu label={t('documents.menu.review')} testId="documents-menu-review" items={[
   {id:'track',label:(doc.trackChanges?'\u2713 ':'')+t('documents.review.track'),enabled,run:()=>void setTrackChanges(!doc.trackChanges)},
   {id:'marks',label:(doc.showMarks?'\u2713 ':'')+t('documents.view.marks'),enabled,run:()=>void setViewMarks(!doc.showMarks,doc.showMarkup)},
   {id:'autocorrect',label:(ac?'\u2713 ':'')+t('documents.autocorrect.toggle'),enabled:true,run:()=>{if(setAutoCorrect(!ac))setAc(!ac);}},
   {id:'a11y',label:t('documents.a11y.open'),enabled,run:()=>setInfoDialog('accessibility')},
   {id:'compare',label:t('documents.review.compare'),enabled,run:()=>void pickAndCompareText().catch(()=>undefined)},
   {id:'review',label:t('documents.review.open'),enabled,run:()=>setInfoDialog('review')}]}/>
  <ActionMenu label={t('documents.menu.document')} testId="documents-menu-document" items={[
   {id:'print',label:t('documents.print.open'),enabled,run:()=>void printCurrent()},
   {id:'props',label:t('documents.props.open'),enabled:true,run:()=>setInfoDialog('properties')},
   {id:'wc',label:t('documents.wc.open'),enabled:true,run:()=>setInfoDialog('wordCount')},
   {id:'png',label:t('documents.export.pagePng'),enabled,run:()=>void executeCommand('documents.export.pagePng')},
   {id:'keys',label:t('documents.shortcuts.title')+' (Ctrl+/)',enabled:true,run:()=>setShortcutsOpen(true)}]}/>
  {linkOpen&&<LinkDialog current={format?.link??''} onClose={()=>setLinkOpen(false)}/>}
 </>;
}
