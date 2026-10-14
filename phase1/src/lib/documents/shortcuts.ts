import {useSyncExternalStore} from 'react';
/** Keyboard shortcuts dialog visibility. Session-only. */
let open=false;const listeners=new Set<()=>void>();
export const shortcutsOpen=()=>open;
export function setShortcutsOpen(next:boolean){if(open===next)return;open=next;listeners.forEach(fn=>fn());}
export const useShortcutsOpen=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},shortcutsOpen,shortcutsOpen);
/** Every document shortcut: i18n label key and the keys. Kept next to the canvas key handler's behaviour. */
export const SHORTCUTS:readonly (readonly [string,string])[]=[
 ['documents.format.bold','Ctrl+B'],['documents.format.italic','Ctrl+I'],['documents.format.underline','Ctrl+U'],
 ['documents.format.strike','Ctrl+Shift+X'],['documents.format.subscript','Ctrl+='],['documents.format.superscript','Ctrl+Shift+='],
 ['documents.format.clear','Ctrl+Space'],['documents.format.link','Ctrl+K'],['documents.shortcuts.size','Ctrl+Shift+< / >'],
 ['documents.shortcuts.align','Ctrl+L / E / R / J'],['documents.shortcuts.indent','Ctrl+[ / ]'],['documents.shortcuts.styles','Ctrl+Alt+0 - 4'],
 ['documents.find.label','Ctrl+F'],['documents.goto.title','Ctrl+G'],['documents.shortcuts.selectAll','Ctrl+A'],
 ['documents.undo','Ctrl+Z'],['documents.redo','Ctrl+Y'],['documents.shortcuts.title','Ctrl+/'],
];
