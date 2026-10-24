// xterm.js host for the bottom panel: one Terminal instance per mounted view, themed from the
// app's CSS variables, with copy/paste shortcuts and resize reporting. Interactive sessions
// wire onData to the PTY; read-only streams pass disableStdin.
import {useEffect,useRef} from 'react';
import {Terminal as XTerm} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export interface XtermController{
 write(data:Uint8Array|string):void;
 clear():void;
 focus():void;
}

function cssVar(name:string,fallback:string):string{
 const value=getComputedStyle(document.documentElement).getPropertyValue(name).trim();
 return value||fallback;
}
function xtermTheme(){
 return {
  background:cssVar('--bg-panel','#101014'),
  foreground:cssVar('--text-primary','#e8e8ef'),
  cursor:cssVar('--accent','#7c5cff'),
  selectionBackground:cssVar('--accent-soft','#3a3450'),
 };
}
const isMac=()=>/Mac|iPhone|iPad/.test(navigator.platform);

export interface XtermHostProps{
 readOnly?:boolean;
 dark:boolean;
 ariaLabel:string;
 onData?:(data:string)=>void;
 onResize?:(cols:number,rows:number)=>void;
 register:(controller:XtermController|null)=>void;
}
export function XtermHost({readOnly,dark,ariaLabel,onData,onResize,register}:XtermHostProps){
 const host=useRef<HTMLDivElement|null>(null);
 const termRef=useRef<XTerm|null>(null);
 const callbacks=useRef({onData,onResize});
 callbacks.current={onData,onResize};
 useEffect(()=>{
  const el=host.current;
  if(!el)return;
  const term=new XTerm({
   fontFamily:cssVar('--mono','ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'),
   fontSize:12.5,
   lineHeight:1.35,
   scrollback:5000,
   cursorBlink:!readOnly,
   disableStdin:!!readOnly,
   theme:xtermTheme(),
  });
  const fit=new FitAddon();
  term.loadAddon(fit);
  term.open(el);
  fit.fit();
  termRef.current=term;
  term.onData(data=>callbacks.current.onData?.(data));
  term.attachCustomKeyEventHandler(event=>{
   if(event.type!=='keydown')return true;
   const mod=isMac()?event.metaKey:event.ctrlKey;
   const key=event.key.toLowerCase();
   // Copy: Ctrl/Cmd+Shift+C always, Ctrl/Cmd+C when there is a selection (otherwise pass ^C through).
   if(mod&&key==='c'&&(event.shiftKey||term.hasSelection())){
    const selection=term.getSelection();
    if(selection)void navigator.clipboard?.writeText(selection).catch(()=>{});
    return false;
   }
   // Paste: Ctrl/Cmd+Shift+V everywhere, Ctrl/Cmd+V on Windows/Linux.
   if(mod&&key==='v'&&(event.shiftKey||!isMac())){
    void navigator.clipboard?.readText().then(text=>{
     if(text)callbacks.current.onData?.(text);
    }).catch(()=>{});
    return false;
   }
   return true;
  });
  register({
   write:data=>term.write(data),
   clear:()=>term.clear(),
   focus:()=>term.focus(),
  });
  let resizeTimer:ReturnType<typeof setTimeout>|undefined;
  const observer=new ResizeObserver(()=>{
   fit.fit();
   clearTimeout(resizeTimer);
   resizeTimer=setTimeout(()=>callbacks.current.onResize?.(term.cols,term.rows),120);
  });
  observer.observe(el);
  return()=>{
   clearTimeout(resizeTimer);
   observer.disconnect();
   register(null);
   termRef.current=null;
   term.dispose();
  };
  // The host lives once per mounted session view; callbacks are read through a ref.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[readOnly]);
 useEffect(()=>{
  // Follow app theme switches without recreating the terminal.
  if(termRef.current)termRef.current.options.theme=xtermTheme();
 },[dark]);
 return <div ref={host} className="terminal-host min-h-0 flex-1" role="application" aria-label={ariaLabel} data-testid="terminal-host"/>;
}
