import {useEffect,useState,useRef} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../ui/dialog';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {useMedia} from '../../lib/media';
import {registerVideoExportOpener} from '../../lib/video/commands';
import {VideoExportSection} from './VideoPanels';
import {EMPTY_STUDIO_CONTEXT} from '../../lib/shell/types';
export function VideoExportReview(){
 const {t}=useT();const media=useMedia();const focus=useRef<HTMLElement|null>(null);const [name,setName]=useState<string|null>(null),[invalid,setInvalid]=useState(false);
 useEffect(()=>registerVideoExportOpener(n=>{focus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setName(n);setInvalid(false);}),[]);
 useEffect(()=>{if(name&&media.active!==name)setInvalid(true);},[name,media.active]);
 return <Dialog open={!!name} onOpenChange={o=>{if(!o)setName(null);}}><DialogContent finalFocus={()=>focus.current?.isConnected?focus.current:document.querySelector<HTMLElement>('[data-testid="hero-action-main"]')} className="dlg-popup" data-testid="video-export-review">
 <header className="dlg-head"><div><DialogTitle>{t('video.hero.export')}</DialogTitle><DialogDescription>{t('video.review.scope')}</DialogDescription></div></header>
 <div className="dlg-body grid gap-3 text-sm"><strong>{name}</strong>{!invalid&&name===media.active?<VideoExportSection sectionId="review" context={EMPTY_STUDIO_CONTEXT} reviewName={name!}/>:<p role="alert">{t('video.review.changed')}</p>}</div>
 <footer className="dlg-foot"><Button variant="outline" onClick={()=>setName(null)}>{t('video.review.close')}</Button></footer>
 </DialogContent></Dialog>;
}
