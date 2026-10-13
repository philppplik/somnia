import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {useSlidesSession,exitSlidesPresentation,getPresentationReturnFocus} from '../../lib/slides/session';
import {presentationKey} from '../../lib/slides/presentKeyboard';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';

/** No animations or transitions: reduced-motion users get the exact same static presentation. */
export function SlidesPresentView(){
 const s=useSlidesSession(),t=useSlidesPanelText();const root=useRef<HTMLDivElement>(null);
 const [visible,setVisible]=useState(true),[black,setBlack]=useState(false),[digits,setDigits]=useState('');
 const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const move=()=>{setVisible(true);clearTimeout(timer.current);timer.current=setTimeout(()=>{if(!root.current?.querySelector('button:focus'))setVisible(false);},2200);};
 const go=(index:number)=>{setBlack(false);setDigits('');if(!s.busy&&index!==s.index)void commandDispatcher.runCommand('slides.showSlide',{index},{origin:'ui'}).catch(()=>{});};
 const exit=()=>void commandDispatcher.runCommand('slides.present.exit',undefined,{origin:'ui'}).catch(()=>{});
 useEffect(()=>{
  const before=getPresentationReturnFocus();const el=root.current!;
  const inert=[...document.body.children].filter(node=>!node.contains(el)).map(node=>[node as HTMLElement,(node as HTMLElement).inert] as const);
  inert.forEach(([node])=>{node.inert=true;});el.focus();move();
  let wasFullscreen=!!document.fullscreenElement;
  const fullscreen=()=>{if(document.fullscreenElement)wasFullscreen=true;else if(wasFullscreen)void exitSlidesPresentation();};
  document.addEventListener('fullscreenchange',fullscreen);
  return()=>{clearTimeout(timer.current);inert.forEach(([node,value])=>{node.inert=value;});document.removeEventListener('fullscreenchange',fullscreen);if(before instanceof HTMLElement&&before.isConnected)before.focus();void exitSlidesPresentation();};
 },[]);
 useEffect(()=>{
  const key=(event:KeyboardEvent)=>{
   if(event.isComposing)return;
   if(event.key==='Tab'){
    event.preventDefault();event.stopImmediatePropagation();setVisible(true);
    const buttons=[...root.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const i=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[(i+(event.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();return;
   }
   // Presentation owns keyboard input. Prevent studio shortcuts from editing a hidden deck.
   event.preventDefault();event.stopImmediatePropagation();
   if(event.repeat||event.ctrlKey||event.metaKey||event.altKey)return;
   if(event.key==='Escape'){exit();return;}
   // Space/Enter on a focused control should activate that control, never advance twice.
   if(document.activeElement instanceof HTMLButtonElement&&[' ','Enter'].includes(event.key)){document.activeElement.click();return;}
   const next=presentationKey(event.key,{index:s.index,count:s.summary?.slides??0,black,digits});
   if(next){setBlack(next.black);setDigits(next.digits);if(next.index!==s.index)go(next.index);}
  };
  window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);
 },[s.index,s.busy,s.summary,black,digits]);
 const count=s.summary?.slides??0,counter=t('slides.present.counter',{number:s.index+1,count});
 return createPortal(<div ref={root} role="dialog" aria-modal="true" aria-label={t('cmd.slides.present')} tabIndex={-1} data-testid="slides-present" onPointerMove={move} onClick={event=>{if(!(event.target as HTMLElement).closest('button'))go(Math.max(0,Math.min(count-1,s.index+(event.clientX<80?-1:1))));}} style={{position:'fixed',inset:0,zIndex:10000,background:'#000',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',outline:'none'}}>
  {!black&&s.image&&<img src={s.image} alt={t('slides.slide',{number:s.index+1})} draggable={false} style={{width:'100%',height:'100%',objectFit:'contain',pointerEvents:'none'}}/>}
  <span className="sr-only" aria-live="polite" aria-atomic="true">{counter}{black?` · ${t('slides.present.black')}`:''}</span>
  {s.busy&&<p role="status" style={{position:'absolute',top:16}}>{t('slides.present.rendering')}</p>}
  {s.error&&<p role="alert" style={{position:'absolute',top:16,padding:12,background:'#222'}}>{s.error}</p>}
  {digits&&<p role="status" style={{position:'absolute',top:16}}>{t('slides.present.jump',{number:digits})}</p>}
  <nav aria-label={t('slides.present.controls')} onFocus={()=>setVisible(true)} onClick={e=>e.stopPropagation()} style={{position:'absolute',bottom:24,display:'flex',gap:12,alignItems:'center',padding:'10px 16px',borderRadius:25,background:'#202024',opacity:visible?1:0,pointerEvents:visible?'auto':'none'}}>
   <button aria-label={t('slides.previous')} disabled={s.busy||s.index===0} onClick={()=>go(s.index-1)} className="rounded-lg px-3 py-2 hover:bg-white/15 disabled:opacity-40">←</button>
   <span>{counter}</span>
   <button aria-label={t('slides.next')} disabled={s.busy||s.index>=count-1} onClick={()=>go(s.index+1)} className="rounded-lg px-3 py-2 hover:bg-white/15 disabled:opacity-40">→</button>
   <button onClick={exit} className="rounded-lg px-3 py-2 hover:bg-white/15">{t('cmd.slides.present.exit')}</button>
  </nav>
 </div>,document.body);
}
