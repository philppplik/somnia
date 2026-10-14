import {useMemo} from 'react';
import {DOC_COLORS} from '../../lib/documents/palette';
import {FONT_SIZES,setFont,setFontColor,setFontSize,toggleFormat} from '../../lib/documents/session';
import type {FormatPatch,FormatState} from '../../lib/documents/protocol';
import {t} from '../../lib/i18n';
import {NativeButton,NativeSelect} from '../ui/native-controls';

/** Families the engine bundles and can really draw, so a choice always renders as shown. */
export const DOC_FONTS=['Source Sans 3','Source Serif 4','Inter','JetBrains Mono'] as const;
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border-0 bg-transparent px-2 text-xs text-ink-2 hover:bg-hover aria-pressed:bg-hover aria-pressed:text-ink disabled:cursor-default disabled:opacity-50';
const sel='h-7 rounded-sm border border-subtle bg-surface px-1 text-xs text-ink disabled:opacity-50';

/** Toolbar row for character formatting. A held format at a collapsed caret overrides what the engine reports. */
export function FormatBar({format,held,enabled}:{format:FormatState|null;held:FormatPatch|null;enabled:boolean}){
 const flag=(p:'bold'|'italic'|'underline')=>held?.[p]??format?.[p]==='on';
 const font=held?.font??format?.font??'';const size=held?.size??format?.size??null;const color=held?.color??format?.color??null;
 const fonts=useMemo(()=>font&&!(DOC_FONTS as readonly string[]).includes(font)?[font,...DOC_FONTS]:[...DOC_FONTS],[font]);
 const sizes=useMemo(()=>size!==null&&!(FONT_SIZES as readonly number[]).includes(size)?[...FONT_SIZES,size].sort((a,b)=>a-b):[...FONT_SIZES],[size]);
 return <div role="toolbar" aria-label={t('documents.format.toolbar')} className="media-bar flex items-center gap-2 border-b border-subtle px-3 py-1" data-testid="documents-format-bar">
  <NativeSelect className={sel+' w-36'} aria-label={t('documents.format.font')} title={t('documents.format.font')} disabled={!enabled} value={font} onChange={e=>void setFont(e.currentTarget.value)} data-testid="documents-format-font">
   {!font&&<option value="" disabled>{t('documents.format.mixed')}</option>}{fonts.map(f=><option key={f} value={f}>{f}</option>)}</NativeSelect>
  <NativeSelect className={sel+' w-16 tabular-nums'} aria-label={t('documents.format.size')} title={t('documents.format.size')} disabled={!enabled} value={size===null?'':String(size)} onChange={e=>void setFontSize(Number(e.currentTarget.value))} data-testid="documents-format-size">
   {size===null&&<option value="" disabled>{'–'}</option>}{sizes.map(s=><option key={s} value={String(s)}>{s}</option>)}</NativeSelect>
  {(['bold','italic','underline'] as const).map(p=><NativeButton key={p} className={tool+' w-6'} aria-label={t('documents.format.'+p)} title={t('documents.format.'+p)} aria-pressed={flag(p)} disabled={!enabled} onClick={()=>void toggleFormat(p)} data-testid={'documents-format-'+p}><span className={p==='bold'?'font-bold':p==='italic'?'italic':'underline'}>{p==='bold'?'B':p==='italic'?'I':'U'}</span></NativeButton>)}
  <span className="flex items-center gap-1" role="group" aria-label={t('documents.format.color')}>
   <NativeButton className={tool} aria-pressed={color==='auto'} disabled={!enabled} onClick={()=>void setFontColor('auto')} data-testid="documents-color-auto">{t('documents.format.colorAuto')}</NativeButton>
   {DOC_COLORS.map(([h,cls])=><NativeButton key={h} className={'h-5 w-5 cursor-pointer rounded-sm border disabled:cursor-default disabled:opacity-50 '+cls+' '+(color?.toUpperCase()===h?'border-ink':'border-subtle')} aria-label={t('documents.format.colorOne',{hex:'#'+h})} title={'#'+h} aria-pressed={color?.toUpperCase()===h} disabled={!enabled} onClick={()=>void setFontColor(h)} data-testid={'documents-color-'+h}/>)}
  </span>
 </div>;
}
