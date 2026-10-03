import {isTauri} from '@tauri-apps/api/core';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {Minus,Square,X} from 'lucide-react';
/** Custom window buttons for the frameless desktop window. Renders nothing in the browser. Close goes through the window close request so the app's unsaved-changes handling still runs. */
export function WindowControls(){
 if(!isTauri())return null;
 const win=()=>getCurrentWindow();
 return <div className="window-controls" role="group" aria-label="Window controls">
  <button type="button" aria-label="Minimize window" onClick={()=>void win().minimize()}><Minus size={14}/></button>
  <button type="button" aria-label="Maximize or restore window" onClick={()=>void win().toggleMaximize()}><Square size={11}/></button>
  <button type="button" aria-label="Close window" className="window-close" onClick={()=>void win().close()}><X size={14}/></button>
 </div>;
}
