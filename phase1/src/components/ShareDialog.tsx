import {useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {useCollab,useShareUi,closeShare,setShareTab,getCollabEngine} from '../lib/collab/store';
import {INVITE_TTL_OPTIONS,DEFAULT_TTL_MS,parseInviteLink,isInsecureRemote,maskLink,timeLeft,roleLabel} from '../lib/collab/invite';
import type {GuestRole,Invite} from '../lib/collab/types';
import '../lib/collab/commands';
const field='h-9 w-full rounded-sm border border-line bg-elevated px-2.5 text-[12px] text-ink';
function InviteRow({invite,ttl}:{invite:Invite;ttl:number}){
 const [shown,setShown]=useState(false);const [copied,setCopied]=useState(false);const [,tick]=useState(0);
 useEffect(()=>{const t=setInterval(()=>tick(n=>n+1),15000);return()=>clearInterval(t);},[]);
 const copy=async()=>{try{await navigator.clipboard.writeText(invite.link);setCopied(true);setTimeout(()=>setCopied(false),1500);}catch{setShown(true);}};
 const left=timeLeft(invite.expiresAt);const dead=left==='expired';
 return <div className="mt-2 rounded-md border border-line p-2.5" data-testid={`invite-${invite.role}`}>
  <div className="flex items-center justify-between text-[12px]"><strong>{roleLabel(invite.role)}</strong><span className={dead?'text-red-500':'text-ink-2'} data-testid={`invite-${invite.role}-expiry`}>{left}</span></div>
  <input readOnly aria-label={`${roleLabel(invite.role)} invite link`} className={`${field} mt-1.5 font-mono`} value={shown?invite.link:maskLink(invite.link)} onFocus={e=>e.currentTarget.select()}/>
  <div className="mt-1.5 flex gap-1.5"><Button size="compact" variant="outline" onClick={()=>void copy()}>{copied?'Copied':'Copy link'}</Button><Button size="compact" aria-pressed={shown} onClick={()=>setShown(s=>!s)}>{shown?'Hide code':'Show code'}</Button><span className="grow"/><Button size="compact" onClick={()=>void getCollabEngine().renewInvite(invite.role as GuestRole,ttl)}>New link</Button></div></div>;}
function HostPane(){
 const {host}=useCollab();const [lan,setLan]=useState(false);const [ttl,setTtl]=useState(DEFAULT_TTL_MS);const eng=getCollabEngine();
 if(host.state==='off'||host.state==='starting'||host.state==='error')return <div>
  <p className="mt-3 text-[12px] text-ink-2">Others can edit this project with you at the same time. Your files stay on your computer. Only you save to disk.</p>
  <label className="mt-3 flex items-center gap-2 text-[12px]"><input type="checkbox" aria-label="Allow people on my network" checked={lan} onChange={e=>setLan(e.target.checked)}/>Allow people on my local network (otherwise only this computer)</label>
  <label className="mt-2 flex items-center gap-2 text-[12px]">Invites last<select aria-label="Invite lifetime" className="h-8 rounded-sm border border-line bg-elevated px-2" value={ttl} onChange={e=>setTtl(Number(e.target.value))}>{INVITE_TTL_OPTIONS.map(o=><option key={o.ms} value={o.ms}>{o.label}</option>)}</select></label>
  {host.error&&<p role="alert" className="mt-2 text-[12px] text-red-500">{host.error.message}</p>}
  <div className="mt-4 flex justify-end gap-2"><Button onClick={closeShare}>Close</Button><Button variant="primary" autoFocus disabled={host.state==='starting'} onClick={()=>void eng.startHosting({lan,ttlMs:ttl})}>{host.state==='starting'?'Starting...':'Start sharing'}</Button></div></div>;
 return <div>
  <p className="mt-3 text-[12px] text-ink-2" data-testid="host-live">Sharing is on{host.lan?' for your local network':' on this computer only'}. Send one of these links to a person you trust. Anyone with a link can join until it runs out.</p>
  {host.lan&&<p className="mt-2 rounded-sm bg-hover p-2 text-[11px] text-ink-2" data-testid="lan-warning">Links on a local network are not encrypted yet. Use them on a network you trust.</p>}
  {host.invites.map(i=><InviteRow key={i.role} invite={i} ttl={ttl}/>)}
  <h3 className="mt-3 text-[12px] font-semibold">People ({host.participants.filter(p=>p.online).length})</h3>
  <ul className="mt-1 text-[12px]" data-testid="participants">{host.participants.map(p=><li key={p.id} className="flex justify-between py-0.5"><span>{p.name}</span><span className="text-ink-2">{roleLabel(p.role)}</span></li>)}</ul>
  <div className="mt-4 flex justify-end gap-2"><Button onClick={closeShare}>Close</Button><Button onClick={()=>void eng.stopHosting()}>Stop sharing</Button></div></div>;}
function JoinPane(){
 const {guest}=useCollab();const [link,setLink]=useState('');const [name,setName]=useState('');const eng=getCollabEngine();
 const parsed=link.trim()?parseInviteLink(link):null;const bad=!!link.trim()&&!parsed;const busy=guest.state==='connecting';
 if(guest.state==='connected'||guest.state==='reconnecting')return <div>
  <p className="mt-3 text-[12px]" data-testid="guest-connected">{guest.state==='reconnecting'?'Connection lost. Trying to reconnect...':`You joined ${guest.hostName??'the host'}.`} {guest.role&&<span className="text-ink-2">You are allowed to: {guest.role==='editor'?'edit':'view only'}.</span>}</p>
  <div className="mt-4 flex justify-end gap-2"><Button onClick={closeShare}>Close</Button><Button onClick={()=>void eng.leave()}>Leave session</Button></div></div>;
 return <form onSubmit={e=>{e.preventDefault();if(parsed&&!busy)void eng.join(link,name);}}>
  <p className="mt-3 text-[12px] text-ink-2">Paste the invite link the host sent you.</p>
  <input aria-label="Invite link" className={`${field} mt-2 font-mono`} placeholder="ws://..." autoComplete="off" spellCheck={false} value={link} onChange={e=>setLink(e.target.value)}/>
  {bad&&<p role="alert" className="mt-1 text-[11px] text-red-500" data-testid="link-invalid">That does not look like a Somnia invite link.</p>}
  {parsed&&isInsecureRemote(parsed)&&<p className="mt-1 text-[11px] text-ink-2" data-testid="insecure-note">This link is not encrypted. Only join on a network you trust.</p>}
  <input aria-label="Your name" className={`${field} mt-2`} placeholder="Your name (shown to others)" maxLength={32} value={name} onChange={e=>setName(e.target.value)}/>
  {guest.state==='error'&&guest.error&&<p role="alert" className="mt-2 text-[12px] text-red-500" data-testid="join-error">{guest.error.message}</p>}
  <div className="mt-4 flex justify-end gap-2"><Button type="button" onClick={closeShare}>Close</Button><Button type="submit" variant="primary" disabled={!parsed||busy}>{busy?'Connecting...':'Join'}</Button></div></form>;}
/** Share / Join dialog. Opened from Tools > Share project... or Join shared project... */
export function ShareDialog(){
 const ui=useShareUi();
 return <Dialog open={ui.open} onOpenChange={o=>{if(!o)closeShare();}}><DialogContent className="confirm-dialog" aria-label="Share and join">
  <DialogTitle>Work together</DialogTitle><DialogDescription className="sr-only">Share this project or join someone else's.</DialogDescription>
  <div className="mt-2 flex gap-1" role="group" aria-label="Mode">{(['host','join'] as const).map(t=><Button key={t} size="compact" aria-pressed={ui.tab===t} className={ui.tab===t?'!bg-accent-soft !text-accent font-semibold':''} onClick={()=>setShareTab(t)}>{t==='host'?'Share my project':'Join a project'}</Button>)}</div>
  {ui.tab==='host'?<HostPane/>:<JoinPane/>}</DialogContent></Dialog>;}
