import {useSyncExternalStore} from 'react';
/** Keyboard shortcuts dialog visibility. Session-only. */
let open=false;const listeners=new Set<()=>void>();
export const shortcutsOpen=()=>open;
export function setShortcutsOpen(next:boolean){if(open===next)return;open=next;listeners.forEach(fn=>fn());}
export const useShortcutsOpen=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},shortcutsOpen,shortcutsOpen);
export type ExtraKey='lineSingle'|'lineDouble'|'line15'|'bullets'|'pageBreak'|'painterCopy'|'painterPaste'|'allCaps'|'smallCaps'|'normalStyle'|'charLook'|'print'|'hanging'|'unhang'|'indent'|'outdent';
/** The Word-style shortcut a key press asks for beyond the basic ones, or null. `mod` is Ctrl (or Cmd). */
export function extraShortcut(k:{key:string;mod:boolean;shift:boolean;alt:boolean}):ExtraKey|null{
 if(!k.mod||k.alt)return null;
 const key=k.key.length===1?k.key.toLowerCase():k.key;
 if(!k.shift){return key==='1'?'lineSingle':key==='2'?'lineDouble':key==='5'?'line15':key==='Enter'?'pageBreak':key==='d'?'charLook':key==='p'?'print':key==='t'?'hanging':key==='m'?'indent':null;}
 return key==='l'?'bullets':key==='c'?'painterCopy':key==='v'?'painterPaste':key==='a'?'allCaps':key==='k'?'smallCaps':key==='n'?'normalStyle':key==='t'?'unhang':key==='m'?'outdent':null;
}
/** Every document shortcut: i18n label key and the keys. Kept next to the canvas key handler's behaviour. */
export const SHORTCUTS:readonly (readonly [string,string])[]=[
 ['documents.format.bold','Ctrl+B'],['documents.format.italic','Ctrl+I'],['documents.format.underline','Ctrl+U'],
 ['documents.format.strike','Ctrl+Shift+X'],['documents.format.subscript','Ctrl+='],['documents.format.superscript','Ctrl+Shift+='],
 ['documents.format.clear','Ctrl+Space'],['documents.format.link','Ctrl+K'],['documents.shortcuts.size','Ctrl+Shift+< / >'],
 ['documents.shortcuts.align','Ctrl+L / E / R / J'],['documents.shortcuts.indent','Ctrl+[ / ]'],['documents.shortcuts.styles','Ctrl+Alt+0 - 4'],
 ['documents.find.label','Ctrl+F'],['documents.goto.title','Ctrl+G'],['documents.shortcuts.selectAll','Ctrl+A'],['documents.shortcuts.special','Ctrl+Shift+Space / -'],
 ['documents.shortcuts.print','Ctrl+P'],['documents.shortcuts.indent','Ctrl+M / Ctrl+Shift+M'],['documents.shortcuts.hanging','Ctrl+T / Ctrl+Shift+T'],['documents.shortcuts.paraNav','Ctrl+Up / Down'],['documents.shortcuts.moveParas','Alt+Shift+Up / Down'],['documents.shortcuts.lineSpacing','Ctrl+1 / 2 / 5'],['documents.shortcuts.bullets','Ctrl+Shift+L'],['documents.shortcuts.pageBreak','Ctrl+Enter'],['documents.shortcuts.painter','Ctrl+Shift+C / V'],
 ['documents.shortcuts.caps','Ctrl+Shift+A / K'],['documents.shortcuts.normal','Ctrl+Shift+N'],['documents.charlook.open','Ctrl+D'],
 ['documents.undo','Ctrl+Z'],['documents.redo','Ctrl+Y'],['documents.shortcuts.title','Ctrl+/'],
];
