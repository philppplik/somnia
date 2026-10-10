import {useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogTitle} from '../ui/dialog';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {CONSENT_BLOCKED,CONSENT_CHANGED,CONSENT_REVIEW,getConsentBroker,type ConsentReviewRequest} from '../../lib/extensions/consentUiHost';
import {ConsentReview,RuntimePermissionDialog} from './ConsentUI';
import type {RuntimePrompt} from '../../lib/extensions/permissionBroker';
/** Trusted app shell only. There is deliberately no postMessage/RPC listener. */
export function ExtensionConsentHost(){const {t}=useT();const [review,setReview]=useState<ConsentReviewRequest|null>(null),[prompt,setPrompt]=useState<RuntimePrompt|null>(null),[blocked,setBlocked]=useState<{extensionId:string;message:string}|null>(null);const [,refresh]=useState(0);const broker=getConsentBroker();
 useEffect(()=>{const poll=()=>{const next=broker.pendingPrompts(document.hasFocus()&&!document.hidden)[0]??null;setPrompt(old=>old?.id===next?.id?old:next);refresh(n=>n+1);};const request=(e:Event)=>setReview(old=>old??(e as CustomEvent<ConsentReviewRequest>).detail);const block=(e:Event)=>setBlocked((e as CustomEvent).detail);window.addEventListener(CONSENT_REVIEW,request);window.addEventListener(CONSENT_BLOCKED,block);window.addEventListener(CONSENT_CHANGED,poll);window.addEventListener('focus',poll);window.addEventListener('blur',poll);document.addEventListener('visibilitychange',poll);const timer=window.setInterval(poll,250);return()=>{clearInterval(timer);window.removeEventListener(CONSENT_REVIEW,request);window.removeEventListener(CONSENT_BLOCKED,block);window.removeEventListener(CONSENT_CHANGED,poll);window.removeEventListener('focus',poll);window.removeEventListener('blur',poll);document.removeEventListener('visibilitychange',poll);};},[broker]);
 if(blocked)return <Dialog open onOpenChange={open=>{if(!open)setBlocked(null);}}><DialogContent className="ext-consent runtime"><div className="ec-body"><DialogTitle render={<h2/>}>{t('extConsent.disabledSafety')}</DialogTitle><div className="ec-card ec-warning"><div><strong>{blocked.extensionId}</strong><p>{blocked.message}</p></div></div><p>{t('extConsent.blockedBody')}</p></div><div className="ec-footer"><Button variant="primary" onClick={()=>setBlocked(null)}>{t('extConsent.understood')}</Button></div></DialogContent></Dialog>;
 if(review)return <ConsentReview key={review.candidate.manifest.id} request={review} broker={broker} onClose={()=>setReview(null)}/>;
 if(prompt)return <RuntimePermissionDialog key={prompt.id} prompt={prompt} broker={broker} onResolved={()=>setPrompt(null)}/>;
 return null;
}
