import {useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {useT} from '../lib/useT';
import {useCollab,useShareUi,closeShare,setShareTab,getCollabEngine} from '../lib/collab/store';
import {INVITE_TTL_OPTIONS,DEFAULT_TTL_MS,parseInviteLink,isInsecureRemote,maskLink,timeLeft,roleLabel} from '../lib/collab/invite';
import type {GuestRole,Invite} from '../lib/collab/types';
import '../lib/collab/commands';
const field='h-9 w-full rounded-sm border border-line bg-elevated px-2.5 text-[12px] text-ink';
function InviteRow({invite,ttl}:{invite:Invite;ttl:number}){
 const {t}=useT();const [shown,setShown]=useState(false);const [copied,setCopied]=useState(false);const [,tick]=useState(0);
 useEffect(()=>{const t=setInterval(()=>tick(n=>n+1),15000);return()=>clearInterval(t);},[]);
 const copy=async()=>{try{await navigator.clipboard.writeText(invite.link);setCopied(true);setTimeout(()=>setCopied(false),1500);}catch{setShown(true);}};
 const left=timeLeft(invite.expiresAt);const dead=invite.expiresAt-Date.now()<500;
 return <div className="mt-2 rounded-md border border-line p-2.5" data-testid={`invite-${invite.role}`}>
  <div className="flex items-center justify-between text-[12px]"><strong>{roleLabel(invite.role)}</strong><span className={dead?'text-red-500':'text-ink-2'} data-testid={`invite-${invite.role}-expiry`}>{left}</span></div>
  <input readOnly aria-label={t('share.inviteLinkOf',{role:roleLabel(invite.role)})} className={`${field} mt-1.5 font-mono`} value={shown?invite.link:maskLink(invite.link)} onFocus={e=>e.currentTarget.select()}/>
  <div className="mt-1.5 flex gap-1.5"><Button size="compact" variant="outline" onClick={()=>void copy()}>{copied?t('share.copied'):t('share.copy')}</Button><Button size="compact" aria-pressed={shown} onClick={()=>setShown(s=>!s)}>{shown?t('share.hideCode'):t('share.showCode')}</Button><span className="grow"/><Button size="compact" onClick={()=>void getCollabEngine().renewInvite(invite.role as GuestRole,ttl)}>{t('share.newLink')}</Button></div></div>;}
function HostPane(){
 const {t}=useT();const {host}=useCollab();const [lan,setLan]=useState(false);const [ttl,setTtl]=useState(DEFAULT_TTL_MS);const eng=getCollabEngine();
 if(host.state==='off'||host.state==='starting'||host.state==='error')return <div>
  <p className="mt-3 text-[12px] text-ink-2">{t('share.hostIntro')}</p>
  <label className="mt-3 flex items-center gap-2 text-[12px]"><input type="checkbox" aria-label={t('share.lanAria')} checked={lan} onChange={e=>setLan(e.target.checked)}/>{t('share.lan')}</label>
  <label className="mt-2 flex items-center gap-2 text-[12px]">{t('share.invitesLast')}<select aria-label={t('share.lifetimeAria')} className="h-8 rounded-sm border border-line bg-elevated px-2" value={ttl} onChange={e=>setTtl(Number(e.target.value))}>{INVITE_TTL_OPTIONS.map(o=><option key={o.ms} value={o.ms}>{t(o.key)}</option>)}</select></label>
  {host.error&&<p role="alert" className="mt-2 text-[12px] text-red-500">{host.error.message}</p>}
  <div className="mt-4 flex justify-end gap-2"><Button onClick={closeShare}>{t('dialogs.close')}</Button><Button variant="primary" autoFocus disabled={host.state==='starting'} onClick={()=>void eng.startHosting({lan,ttlMs:ttl})}>{host.state==='starting'?t('share.starting'):t('share.start')}</Button></div></div>;
 return <div>
  <p className="mt-3 text-[12px] text-ink-2" data-testid="host-live">{host.lan?t('share.liveLan'):t('share.liveLocal')}</p>
  {host.lan&&<p className="mt-2 rounded-sm bg-hover p-2 text-[11px] text-ink-2" data-testid="lan-warning">{t('share.lanWarning')}</p>}
  {host.invites.map(i=><InviteRow key={i.role} invite={i} ttl={ttl}/>)}
  <h3 className="mt-3 text-[12px] font-semibold">{t('share.people',{count:host.participants.filter(p=>p.online).length})}</h3>
  <ul className="mt-1 text-[12px]" data-testid="participants">{host.participants.map(p=><li key={p.id} className="flex justify-between py-0.5"><span>{p.name}</span><span className="text-ink-2">{roleLabel(p.role)}</span></li>)}</ul>
  <div className="mt-4 flex justify-end gap-2"><Button onClick={closeShare}>{t('dialogs.close')}</Button><Button onClick={()=>void eng.stopHosting()}>{t('share.stop')}</Button></div></div>;}
function JoinPane(){
 const {t}=useT();const {guest}=useCollab();const [link,setLink]=useState('');const [name,setName]=useState('');const eng=getCollabEngine();
 const parsed=link.trim()?parseInviteLink(link):null;const bad=!!link.trim()&&!parsed;const busy=guest.state==='connecting';
 if(guest.state==='connected'||guest.state==='reconnecting')return <div>
  <p className="mt-3 text-[12px]" data-testid="guest-connected">{guest.state==='reconnecting'?t('share.reconnecting'):t('share.joined',{host:guest.hostName??t('share.theHost')})} {guest.role&&<span className="text-ink-2">{guest.role==='editor'?t('share.allowedEdit'):t('share.allowedView')}</span>}</p>
  <div className="mt-4 flex justify-end gap-2"><Button onClick={closeShare}>{t('dialogs.close')}</Button><Button onClick={()=>void eng.leave()}>{t('share.leave')}</Button></div></div>;
 return <form onSubmit={e=>{e.preventDefault();if(parsed&&!busy)void eng.join(link,name);}}>
  <p className="mt-3 text-[12px] text-ink-2">{t('share.pasteHint')}</p>
  <input aria-label={t('share.inviteLink')} className={`${field} mt-2 font-mono`} placeholder="ws://..." autoComplete="off" spellCheck={false} value={link} onChange={e=>setLink(e.target.value)}/>
  {bad&&<p role="alert" className="mt-1 text-[11px] text-red-500" data-testid="link-invalid">{t('share.invalidLink')}</p>}
  {parsed&&isInsecureRemote(parsed)&&<p className="mt-1 text-[11px] text-ink-2" data-testid="insecure-note">{t('share.insecure')}</p>}
  <input aria-label={t('share.yourName')} className={`${field} mt-2`} placeholder={t('share.namePlaceholder')} maxLength={32} value={name} onChange={e=>setName(e.target.value)}/>
  {guest.state==='error'&&guest.error&&<p role="alert" className="mt-2 text-[12px] text-red-500" data-testid="join-error">{guest.error.message}</p>}
  <div className="mt-4 flex justify-end gap-2"><Button type="button" onClick={closeShare}>{t('dialogs.close')}</Button><Button type="submit" variant="primary" disabled={!parsed||busy}>{busy?t('share.connecting'):t('share.join')}</Button></div></form>;}
/** Share / Join dialog. Opened from Tools > Share project... or Join shared project... */
export function ShareDialog(){
 const {t}=useT();const ui=useShareUi();
 return <Dialog open={ui.open} onOpenChange={o=>{if(!o)closeShare();}}><DialogContent className="confirm-dialog" aria-label={t('share.aria')}>
  <DialogTitle>{t('share.title')}</DialogTitle><DialogDescription className="sr-only">{t('share.desc')}</DialogDescription>
  <div className="mt-2 flex gap-1" role="group" aria-label={t('share.mode')}>{(['host','join'] as const).map(m=><Button key={m} size="compact" aria-pressed={ui.tab===m} className={ui.tab===m?'!bg-accent-soft !text-accent font-semibold':''} onClick={()=>setShareTab(m)}>{m==='host'?t('share.tabHost'):t('share.tabJoin')}</Button>)}</div>
  {ui.tab==='host'?<HostPane/>:<JoinPane/>}</DialogContent></Dialog>;}
