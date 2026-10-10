import {useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogTitle} from '../ui/dialog';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {CONSENT_BLOCKED,CONSENT_CHANGED,CONSENT_REVIEW,getConsentBroker,type ConsentReviewRequest} from '../../lib/extensions/consentUiHost';
import {ConsentReview,RuntimePermissionDialog} from './ConsentUI';
import type {RuntimePrompt} from '../../lib/extensions/permissionBroker';
/** Trusted app shell only. There is deliberately no postMessage/RPC listener. */
export function ExtensionConsentHost(){const {t}=useT();const [reviews,setReviews]=useState<ConsentReviewRequest[]>([]),[prompt,setPrompt]=useState<RuntimePrompt|null>(null),[blocks,setBlocks]=useState<{extensionId:string;message:string}[]>([]);const [,refresh]=useState(0);const [reviewEpoch,setReviewEpoch]=useState(0);const broker=getConsentBroker();const review=reviews[0]??null,blocked=blocks[0]??null;
 useEffect(()=>{const poll=()=>{const next=broker.pendingPrompts(document.hasFocus()&&!document.hidden)[0]??null;setPrompt(old=>old?.id===next?.id?old:next);refresh(n=>n+1);};const request=(e:Event)=>{e.preventDefault();const next=(e as CustomEvent<ConsentReviewRequest>).detail;setReviews(old=>[...old,next]);};const block=(e:Event)=>setBlocks(old=>[...old,(e as CustomEvent).detail]);window.addEventListener(CONSENT_REVIEW,request);window.addEventListener(CONSENT_BLOCKED,block);window.addEventListener(CONSENT_CHANGED,poll);window.addEventListener('focus',poll);window.addEventListener('blur',poll);document.addEventListener('visibilitychange',poll);const timer=window.setInterval(poll,250);return()=>{clearInterval(timer);window.removeEventListener(CONSENT_REVIEW,request);window.removeEventListener(CONSENT_BLOCKED,block);window.removeEventListener(CONSENT_CHANGED,poll);window.removeEventListener('focus',poll);window.removeEventListener('blur',poll);document.removeEventListener('visibilitychange',poll);};},[broker]);
 if(blocked)return <Dialog open onOpenChange={open=>{if(!open)setBlocks(old=>old.slice(1));}}><DialogContent className="ext-consent runtime"><div className="ec-body"><DialogTitle render={<h2/>}>{t('extConsent.disabledSafety')}</DialogTitle><div className="ec-card ec-warning"><div><strong>{blocked.extensionId}</strong><p>{blocked.message}</p></div></div><p>{t('extConsent.blockedBody')}</p></div><div className="ec-footer"><Button variant="primary" onClick={()=>setBlocks(old=>old.slice(1))}>{t('extConsent.understood')}</Button></div></DialogContent></Dialog>;
 if(review)return <ConsentReview key={reviewEpoch} request={review} broker={broker} onClose={()=>{setReviews(old=>old.slice(1));setReviewEpoch(n=>n+1);}}/>;
 if(prompt)return <RuntimePermissionDialog key={prompt.id} prompt={prompt} broker={broker} onResolved={()=>setPrompt(null)}/>;
 return null;
}
