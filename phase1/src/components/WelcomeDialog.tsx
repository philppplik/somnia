import {useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {useT} from '../lib/useT';
import {openExternal,REPO_URL} from '../lib/openExternal';
import {shouldShowWelcome,markWelcomeSeen,changelogUrl} from '../lib/welcome';
import logoMark from '../assets/logo-mark.svg';
import shape from '../assets/welcome-shape.svg';
/** Progressive blur: the shape is stacked in several layers whose masks cross-fade linearly (plus-lighter adds them back to exactly 100%). Blur is 0 at the base of the shape and grows towards its top, so there are no visible bands. Positions are percent of the SVG height, measured from the bottom (the shape spans 14% to 86%). */
const LOW=14,HIGH=86,STEPS=9,MAX_BLUR=34;
const LAYERS=Array.from({length:STEPS},(_,i)=>{const pos=LOW+(HIGH-LOW)*i/(STEPS-1);const prev=i===0?pos-100:pos-(HIGH-LOW)/(STEPS-1),next=i===STEPS-1?pos+100:pos+(HIGH-LOW)/(STEPS-1);
 const blur=MAX_BLUR*Math.pow(i/(STEPS-1),1.7);
 const mask=`linear-gradient(to top,transparent ${prev}%,#000 ${pos}%,transparent ${next}%)`;return {blur:Math.round(blur*10)/10,mask};});
/** Shown once per version right after an update. */
export function WelcomeDialog(){
 const {t}=useT();const [open,setOpen]=useState(()=>shouldShowWelcome(localStorage,__APP_RELEASE__));
 useEffect(()=>{markWelcomeSeen(localStorage,__APP_RELEASE__);},[]);/* also on a first install, so the next update is recognised as an update */
 return <Dialog open={open} onOpenChange={setOpen}><DialogContent className="welcome-dialog" aria-label={t('welcome.aria',{version:__APP_RELEASE__})} data-testid="welcome-dialog">
  <div className="welcome-shape" aria-hidden="true"><div className="welcome-shape-stack">{LAYERS.map((l,i)=><img key={i} src={shape} alt="" draggable={false} style={{filter:l.blur?`blur(${l.blur}px)`:undefined,WebkitMaskImage:l.mask,maskImage:l.mask}}/>)}</div></div>
  <div className="welcome-body">
   <div className="welcome-logo" style={{maskImage:`url("${logoMark}")`,WebkitMaskImage:`url("${logoMark}")`}} aria-hidden="true"/>
   <DialogTitle className="welcome-title">{t('welcome.title')}</DialogTitle>
   <DialogDescription className="welcome-version">Somnia v{__APP_RELEASE__}</DialogDescription>
  </div>
  <div className="welcome-actions">
   <Button autoFocus className="welcome-start" data-testid="welcome-start" onClick={()=>setOpen(false)}>{t('welcome.start')}</Button>
   <button type="button" className="welcome-changelog" data-testid="welcome-changelog" onClick={()=>void openExternal(changelogUrl(REPO_URL,__APP_RELEASE__)).catch(()=>{})}>{t('welcome.changelog')}</button>
  </div></DialogContent></Dialog>;}
