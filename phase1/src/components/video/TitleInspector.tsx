import {Plus} from '../../lib/icons';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {MAX_TITLE_CHARS,MAX_TITLE_SECONDS,sanitizeTitleSpec,type TitleClip,type TitleSpec} from '../../lib/video/titles';
const row='grid gap-1.5 border-b border-subtle px-3 py-3 text-xs text-ink-2';
const field='h-7 w-full rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
/** "Add title card" row for the Video inspector. */
export function TitleAddRow({onAdd,disabled}:{onAdd:()=>void;disabled?:boolean}){
 const {t}=useT();
 return <div className={row} data-testid="video-add-title-row">
  <Button size="compact" variant="outline" disabled={disabled} title={t('video.card.addHint')} onClick={onAdd} data-testid="video-add-title"><Plus size={13}/>{t('video.card.add')}</Button>
 </div>;
}
/** Text, length, colours, font basics and fades of the selected title card. Pure: the parent applies the changes. */
export function TitleInspector({clip,onChange,onDuration}:{clip:TitleClip;onChange:(patch:Partial<TitleSpec>)=>void;onDuration:(seconds:number)=>void}){
 const {t}=useT();const s=sanitizeTitleSpec(clip.title);
 const num=(v:string,fb:number)=>{const n=Number(v);return Number.isFinite(n)?n:fb;};
 return <div className={row} data-testid="video-title-panel">
  <span className="text-ink">{t('video.card.panel')}</span>
  <label>{t('video.card.text')}<textarea className={`${field} mt-1 h-20 resize-y py-1`} maxLength={MAX_TITLE_CHARS} value={s.text} onChange={e=>onChange({text:e.target.value})} data-testid="video-title-text"/></label>
  <div className="grid grid-cols-2 gap-2">
   <label>{t('video.card.duration')}<input type="number" className={`${field} mt-1`} min={0.05} max={MAX_TITLE_SECONDS} step={0.1} value={Number((clip.out_s-clip.in_s).toFixed(2))} onChange={e=>onDuration(num(e.target.value,clip.out_s-clip.in_s))} data-testid="video-title-duration"/></label>
   <label>{t('video.card.size')}<input type="number" className={`${field} mt-1`} min={8} max={600} step={1} value={s.size} onChange={e=>onChange({size:num(e.target.value,s.size)})} data-testid="video-title-font-size"/></label>
   <label>{t('video.card.background')}<input type="color" className={`${field} mt-1 p-0.5`} value={s.background.length===4?`#${[...s.background.slice(1)].map(c=>c+c).join('')}`:s.background} onChange={e=>onChange({background:e.target.value})} data-testid="video-title-background"/></label>
   <label>{t('video.card.color')}<input type="color" className={`${field} mt-1 p-0.5`} value={s.color.length===4?`#${[...s.color.slice(1)].map(c=>c+c).join('')}`:s.color} onChange={e=>onChange({color:e.target.value})} data-testid="video-title-color"/></label>
   <label>{t('video.card.font')}<select className={`${field} mt-1`} value={s.font} onChange={e=>onChange({font:e.target.value as TitleSpec['font']})} data-testid="video-title-font">
    <option value="sans">{t('video.card.fontSans')}</option><option value="serif">{t('video.card.fontSerif')}</option><option value="mono">{t('video.card.fontMono')}</option></select></label>
   <div className="flex items-end gap-3 pb-1">
    <label className="flex items-center gap-1.5"><input type="checkbox" className="!size-4 !w-4 shrink-0 accent-[var(--accent)]" checked={s.bold} onChange={e=>onChange({bold:e.target.checked})} data-testid="video-title-bold"/>{t('video.card.bold')}</label>
    <label className="flex items-center gap-1.5"><input type="checkbox" className="!size-4 !w-4 shrink-0 accent-[var(--accent)]" checked={s.italic} onChange={e=>onChange({italic:e.target.checked})} data-testid="video-title-italic"/>{t('video.card.italic')}</label>
   </div>
   <label>{t('video.card.align')}<select className={`${field} mt-1`} value={s.align} onChange={e=>onChange({align:e.target.value as TitleSpec['align']})} data-testid="video-title-align">
    <option value="left">{t('video.card.alignLeft')}</option><option value="center">{t('video.card.alignCenter')}</option><option value="right">{t('video.card.alignRight')}</option></select></label>
   <label>{t('video.card.vAlign')}<select className={`${field} mt-1`} value={s.vAlign} onChange={e=>onChange({vAlign:e.target.value as TitleSpec['vAlign']})} data-testid="video-title-valign">
    <option value="top">{t('video.card.top')}</option><option value="middle">{t('video.card.middle')}</option><option value="bottom">{t('video.card.bottom')}</option></select></label>
   <label>{t('video.card.fadeIn')}<input type="number" className={`${field} mt-1`} min={0} max={10} step={0.1} value={s.fadeIn} onChange={e=>onChange({fadeIn:num(e.target.value,s.fadeIn)})} data-testid="video-title-fadein"/></label>
   <label>{t('video.card.fadeOut')}<input type="number" className={`${field} mt-1`} min={0} max={10} step={0.1} value={s.fadeOut} onChange={e=>onChange({fadeOut:num(e.target.value,s.fadeOut)})} data-testid="video-title-fadeout"/></label>
  </div>
  <p className="m-0 text-ink-3">{t('video.card.hint')}</p>
 </div>;
}
