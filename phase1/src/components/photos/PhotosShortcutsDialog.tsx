/** Keyboard reference overlay: every photos shortcut that is actually wired, grouped. Opened from the strip menu or the ? key; state lives in panel state so both entry points share it. */
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../ui/dialog';
import {usePanelState} from '../../store/panelStateStore';
import {useT} from '../../lib/useT';
interface Row{keys:string;labelKey:string;}
const GROUPS:{titleKey:string;rows:Row[]}[]=[
 {titleKey:'photos.keys.groupCulling',rows:[
  {keys:'0–5',labelKey:'photos.keys.stars'},
  {keys:'P',labelKey:'photos.keys.pick'},
  {keys:'X',labelKey:'photos.keys.reject'},
  {keys:'U',labelKey:'photos.keys.unflag'},
  {keys:'6–9',labelKey:'photos.keys.labels'},
  {keys:'Ctrl+Z',labelKey:'photos.keys.undoCull'},
  {keys:'Ctrl+Shift+Z',labelKey:'photos.keys.redoCull'},
 ]},
 {titleKey:'photos.keys.groupNav',rows:[
  {keys:'← →',labelKey:'photos.keys.prevNext'},
  {keys:'Home End',labelKey:'photos.keys.firstLast'},
  {keys:'?',labelKey:'photos.keys.open'},
  {keys:'Esc',labelKey:'photos.keys.escape'},
 ]},
 {titleKey:'photos.keys.groupView',rows:[
  {keys:'+ −',labelKey:'photos.keys.zoomInOut'},
  {keys:'Z',labelKey:'photos.keys.zoomToggle'},
  {keys:'\\',labelKey:'photos.keys.compare'},
  {keys:'L',labelKey:'photos.keys.lightsOut'},
  {keys:'[ ]',labelKey:'photos.keys.rotate'},
  {keys:'O',labelKey:'photos.keys.guides'},
  {keys:'Enter',labelKey:'photos.keys.commitCrop'},
 ]},
];
export function PhotosShortcutsDialog(){
 const {t}=useT();
 const [open,setOpen]=usePanelState<boolean>('photos.shortcuts',false);
 if(!open)return null;
 return <Dialog open onOpenChange={o=>{if(!o)setOpen(false);}}><DialogContent data-testid="photos-shortcuts">
  <header><DialogTitle>{t('photos.keys.title')}</DialogTitle><DialogDescription>{t('photos.keys.hint')}</DialogDescription></header>
  <div className="grid gap-3 overflow-auto">
   {GROUPS.map(g=><section key={g.titleKey} className="grid gap-1">
    <span className="font-medium text-ink" data-testid={`photos-shortcuts-group-${g.titleKey.split('.').pop()}`}>{t(g.titleKey)}</span>
    {g.rows.map(r=><span key={r.keys} className="flex items-center justify-between gap-3" data-testid={`photos-shortcuts-row-${r.labelKey.split('.').pop()}`}>
     <span className="text-ink-2">{t(r.labelKey)}</span>
     <kbd className="rounded-[3px] border border-subtle bg-elevated px-1.5 text-ink tabular-nums">{r.keys}</kbd>
    </span>)}
   </section>)}
  </div>
 </DialogContent></Dialog>;
}
