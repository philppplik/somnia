import {Button} from '../ui/button';
import {Dialog,DialogContent,DialogTitle} from '../ui/dialog';
import {useT} from '../../lib/useT';
import {isMac} from '../../lib/commands';
import {SHEETS_SHORTCUT_GROUPS,formatSheetsShortcut,setSheetsShortcutsOpen,useSheetsShortcutsOpen} from '../../lib/sheets/shortcuts';
/** Cheatsheet of the keys the spreadsheet grid really handles. Esc, the backdrop and the button close it. */
export function SheetsShortcutsDialog(){
 const {t}=useT(),open=useSheetsShortcutsOpen(),mac=isMac();
 return <Dialog open={open} onOpenChange={next=>setSheetsShortcutsOpen(next)}><DialogContent aria-label={t('sheets.sc.title')} data-testid="sheets-shortcuts">
  <DialogTitle>{t('sheets.sc.title')}</DialogTitle>
  <div className="flex max-h-[70vh] flex-col gap-3 overflow-auto">
   {SHEETS_SHORTCUT_GROUPS.map(g=><section key={g.id} className="flex flex-col gap-1" aria-label={t('sheets.sc.g.'+g.id)}>
    <h3 className="text-ink-2">{t('sheets.sc.g.'+g.id)}</h3>
    <ul className="flex flex-col gap-1">{g.entries.map(e=><li key={e.combo} className="flex items-center justify-between gap-3"><span>{t(e.labelKey)}</span><kbd className="shrink-0">{formatSheetsShortcut(e.combo,mac)}</kbd></li>)}</ul>
   </section>)}
  </div>
  <Button size="compact" variant="outline" className="self-end" onClick={()=>setSheetsShortcutsOpen(false)}>{t('sheets.sc.close')}</Button>
 </DialogContent></Dialog>;
}
