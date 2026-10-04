import {useEffect,useState} from 'react';
import {addTextFiles,readFiles} from '../lib/projectActions';
/** Drag text files from the file manager into the window: they open as files (or start a project). Desktop windows have Tauri's own drop handling off, so the browser File API sees the files. */
export function DropOverlay(){
 const [active,setActive]=useState(false);
 useEffect(()=>{let depth=0;const hasFiles=(e:DragEvent)=>!!e.dataTransfer&&[...e.dataTransfer.types].includes('Files');
  const enter=(e:DragEvent)=>{if(!hasFiles(e))return;e.preventDefault();depth+=1;setActive(true);};
  const over=(e:DragEvent)=>{if(hasFiles(e))e.preventDefault();};
  const leave=(e:DragEvent)=>{if(!hasFiles(e))return;depth=Math.max(0,depth-1);if(!depth)setActive(false);};
  const drop=(e:DragEvent)=>{if(!hasFiles(e))return;e.preventDefault();depth=0;setActive(false);const list=e.dataTransfer?.files;if(list?.length)void readFiles(list).then(addTextFiles);};
  window.addEventListener('dragenter',enter);window.addEventListener('dragover',over);window.addEventListener('dragleave',leave);window.addEventListener('drop',drop);
  return()=>{window.removeEventListener('dragenter',enter);window.removeEventListener('dragover',over);window.removeEventListener('dragleave',leave);window.removeEventListener('drop',drop);};},[]);
 if(!active)return null;
 return <div aria-hidden="true" data-testid="drop-overlay" className="pointer-events-none fixed inset-3 z-[200] flex items-center justify-center rounded-[25px] border-2 border-dashed border-[var(--accent)] bg-[color-mix(in_srgb,var(--bg-base)_80%,transparent)] text-[15px] font-medium text-ink">Drop files to open them in Somnia</div>;}
