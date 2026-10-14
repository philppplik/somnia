import {useState} from 'react';
import {insertPageBreak,clearFormatting,hasTextSelection,setHighlight,setLink,toggleFormat,toggleVertAlign} from '../../lib/documents/session';
import {HIGHLIGHTS,MAX_LINK_CHARS,linkProblem,type FormatPatch,type FormatState,type HighlightName} from '../../lib/documents/protocol';
import {setShortcutsOpen} from '../../lib/documents/shortcuts';
import {setInfoDialog} from '../../lib/documents/infoDialog';
import {setParagraphOptionsOpen} from '../../lib/documents/paragraphOptions';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput,NativeSelect} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border-0 bg-transparent px-2 text-xs text-ink-2 hover:bg-hover aria-pressed:bg-hover aria-pressed:text-ink disabled:cursor-default disabled:opacity-50';
const sel='h-7 rounded-sm border border-subtle bg-surface px-1 text-xs text-ink disabled:opacity-50';
/** Link the selected text: http, https or mailto only. An empty address removes the link. */
export function LinkDialog({current,onClose}:{current:string;onClose:()=>void}){
 const {t}=useT();const [v,setV]=useState(current);const bad=v!==''&&linkProblem(v)!==null;
 const apply=(url:string)=>{if(linkProblem(url)!==null)return;onClose();void setLink(url);};
 return <div role="dialog" aria-modal="true" aria-labelledby="documents-link-title" className="fixed inset-0 z-20 grid place-items-center bg-black/30" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}if(e.key==='Enter'){e.preventDefault();apply(v);}}}>
  <div className="grid w-96 max-w-full gap-3 rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl" data-testid="documents-link-dialog">
   <h2 id="documents-link-title" className="text-sm font-medium">{t('documents.format.linkTitle')}</h2>
   <label className="grid gap-1 text-xs text-ink-2">{t('documents.format.linkUrl')}
    <NativeInput className="rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink" autoFocus maxLength={MAX_LINK_CHARS} value={v} placeholder="https://" aria-invalid={bad} onChange={e=>setV(e.currentTarget.value.trim())} data-testid="documents-link-input"/></label>
   <div className="flex justify-end gap-2">
    {current!==''&&<NativeButton className={tool+' border border-subtle'} onClick={()=>apply('')} data-testid="documents-link-remove">{t('documents.format.linkRemove')}</NativeButton>}
    <NativeButton className={tool+' border border-subtle'} disabled={v===''||bad} onClick={()=>apply(v)} data-testid="documents-link-apply">{t('documents.format.linkApply')}</NativeButton></div>
  </div>
 </div>;
}
/** Strikethrough, small caps, superscript, subscript, highlight, link and clear-formatting controls. */
export function TextEffects({format,held,enabled}:{format:FormatState|null;held:FormatPatch|null;enabled:boolean}){
 const {t}=useT();const [linkOpen,setLinkOpen]=useState(false);
 const on=(p:'strike'|'smallCaps')=>held?.[p]??format?.[p]==='on';
 const vert=held?.vertAlign??format?.vertAlign??null;const hl=held?.highlight??format?.highlight??null;
 const picked=hasTextSelection();
 return <>
  <NativeButton className={tool+' w-6 border border-subtle'} aria-label={t('documents.format.strike')} title={t('documents.format.strike')+' (Ctrl+Shift+X)'} aria-pressed={on('strike')} disabled={!enabled} onClick={()=>void toggleFormat('strike')} data-testid="documents-format-strike"><span className="line-through">S</span></NativeButton>
  <NativeButton className={tool+' w-6 border border-subtle'} aria-label={t('documents.format.smallCaps')} title={t('documents.format.smallCaps')} aria-pressed={on('smallCaps')} disabled={!enabled} onClick={()=>void toggleFormat('smallCaps')} data-testid="documents-format-smallcaps"><span>{'Aa'}</span></NativeButton>
  <NativeButton className={tool+' w-6 border border-subtle'} aria-label={t('documents.format.superscript')} title={t('documents.format.superscript')+' (Ctrl+Shift+=)'} aria-pressed={vert==='superscript'} disabled={!enabled} onClick={()=>void toggleVertAlign('superscript')} data-testid="documents-format-superscript"><span>{'x\u00b2'}</span></NativeButton>
  <NativeButton className={tool+' w-6 border border-subtle'} aria-label={t('documents.format.subscript')} title={t('documents.format.subscript')+' (Ctrl+=)'} aria-pressed={vert==='subscript'} disabled={!enabled} onClick={()=>void toggleVertAlign('subscript')} data-testid="documents-format-subscript"><span>{'x\u2082'}</span></NativeButton>
  <NativeSelect className={sel+' w-28'} aria-label={t('documents.format.highlight')} title={t('documents.format.highlight')} disabled={!enabled} value={hl??''} onChange={e=>void setHighlight(e.currentTarget.value as HighlightName)} data-testid="documents-format-highlight">
   {hl===null&&<option value="" disabled>{t('documents.format.highlight')}</option>}{hl==='other'&&<option value="other" disabled>{t('documents.format.other')}</option>}
   {HIGHLIGHTS.map(h=><option key={h} value={h}>{t(h==='none'?'documents.format.hl.none':'documents.format.hl.'+h)}</option>)}</NativeSelect>
  <NativeButton className={tool+' border border-subtle'} aria-pressed={!!format?.link} title={t('documents.format.link')+' (Ctrl+K)'} disabled={!enabled||!picked} onClick={()=>setLinkOpen(true)} data-testid="documents-format-link">{t('documents.format.link')}</NativeButton>
  <NativeButton className={tool+' border border-subtle'} title={t('documents.format.clear')+' (Ctrl+Space)'} disabled={!enabled||!picked} onClick={()=>void clearFormatting()} data-testid="documents-format-clear">{t('documents.format.clear')}</NativeButton>
  <NativeButton className={tool+' border border-subtle'} disabled={!enabled} onClick={()=>setParagraphOptionsOpen(true)} data-testid="documents-paraopt-open">{t('documents.para.opt.open')}</NativeButton>
  <NativeButton className={tool+' border border-subtle'} disabled={!enabled} onClick={()=>void insertPageBreak()} data-testid="documents-page-break">{t('documents.para.opt.insertBreak')}</NativeButton>
  <NativeButton className={tool+' border border-subtle'} onClick={()=>setInfoDialog('properties')} data-testid="documents-props-open">{t('documents.props.open')}</NativeButton>
  <NativeButton className={tool+' border border-subtle'} onClick={()=>setInfoDialog('wordCount')} data-testid="documents-wc-open">{t('documents.wc.open')}</NativeButton>
  <NativeButton className={tool+' border border-subtle'} onClick={()=>setShortcutsOpen(true)} title={t('documents.shortcuts.title')+' (Ctrl+/)'} data-testid="documents-shortcuts-open">{t('documents.shortcuts.open')}</NativeButton>
  {linkOpen&&<LinkDialog current={format?.link??''} onClose={()=>setLinkOpen(false)}/>}
 </>;
}
