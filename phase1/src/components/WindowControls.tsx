import {useAppStore} from '../store/appStore';
import {isTauri} from '@tauri-apps/api/core';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {Minus,Square,X} from '../lib/icons';
import {useT} from '../lib/useT';
/** Custom window buttons for the frameless desktop window. Renders nothing in the browser. Close goes through the window close request so the app's unsaved-changes handling still runs. */
export function WindowControls(){const {t}=useT();
 const prefs=useAppStore().windowPrefs;
 if(!isTauri()||prefs.frame==='system')return null;
 const win=()=>getCurrentWindow();
 return <div className="ml-2 flex gap-1" role="group" aria-label={t('rest.windowControls.windowControls')}>
  <button type="button" className="grid h-9 w-10 cursor-pointer place-items-center rounded-sm border-0 bg-transparent text-ink-2 hover:bg-hover hover:text-ink" aria-label={t('rest.windowControls.minimizeWindow')} onClick={()=>void win().minimize()}><Minus size={14}/></button>
  <button type="button" className="grid h-9 w-10 cursor-pointer place-items-center rounded-sm border-0 bg-transparent text-ink-2 hover:bg-hover hover:text-ink" aria-label={t('rest.windowControls.maximizeOrRestoreWindow')} onClick={()=>void win().toggleMaximize()}><Square size={11}/></button>
  <button type="button" aria-label={t('rest.windowControls.closeWindow')} className="grid h-9 w-10 cursor-pointer place-items-center rounded-sm border-0 bg-transparent text-ink-2 hover:bg-[#e5484d] hover:text-white" onClick={()=>void win().close()}><X size={14}/></button>
 </div>;
}
