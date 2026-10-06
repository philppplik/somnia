import {useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {useT} from '../lib/useT';
import {useCollab,useShareUi,closeShare,setShareTab,getCollabEngine} from '../lib/collab/store';
import {parseJoinLink,isInsecureRemote,hasLinkKey,maskLink,relayRoomUrl,RELAY_URL_KEY} from '../lib/collab/invite';
import {getLanHost} from '../lib/collab/lanHostPort';
import {collabLabel} from './CollabStatus';
import {LanHostSettings} from './LanHostSettings';
import type {CollabSnapshot,CollabError} from '../lib/collab/types';
import '../lib/collab/commands';
const field='h-9 w-full rounded-sm border border-line bg-elevated px-2.5 text-[12px] text-ink';
type T=(k:string,p?:Record<string,string|number>)=>string;
const errText=(e:CollabError,t:T)=>e.kind==='start-failed'&&e.message?e.message:t(`share.err.${e.kind}`);
function LinkRow({label,link,testId}:{label:string;link:string;testId:string}){
 const {t}=useT();const [shown,setShown]=useState(false);const [copied,setCopied]=useState(false);
 const copy=async()=>{try{await navigator.clipboard.writeText(link);setCopied(true);setTimeout(()=>setCopied(false),1500);}catch{setShown(true);}};
 return <div className="mt-2 rounded-md border border-line p-2.5" data-testid={testId}>
  <strong className="text-[12px]">{label}</strong>
  <input readOnly aria-label={t('share.linkOf',{label})} className={`${field} mt-1.5 font-mono`} value={shown?link:maskLink(link)} onFocus={e=>e.currentTarget.select()}/>
  <div className="mt-1.5 flex gap-1.5"><Button size="compact" variant="outline" onClick={()=>void copy()}>{copied?t('share.copied'):t('share.copy')}</Button><Button size="compact" aria-pressed={shown} onClick={()=>setShown(s=>!s)}>{shown?t('share.hideLink'):t('share.showLink')}</Button></div></div>;}
/** Status block shared by host and guest: state, mode, encryption (with fingerprint), waiting/queue notes. All from the snapshot. */
function StatusBlock({s}:{s:CollabSnapshot}){
 const {t}=useT();const l=collabLabel(s,t);if(!l)return null;
 return <div className="mt-3 rounded-sm bg-hover p-2 text-[11px] text-ink-2" data-testid="conn-status">
  <p className="flex items-center gap-1.5 text-[12px] text-ink"><span aria-hidden className={`size-2 rounded-full ${l.tone}`}/><span data-testid="conn-label">{l.label}</span></p>
  {s.security?.e2e?<p className="mt-1" data-testid="e2e-note">{t('share.fingerprint',{fp:s.security.fingerprint??''})}</p>:<p className="mt-1" role="alert" data-testid="no-e2e">{t('share.noKey')}</p>}
  {s.security?.insecureRemote&&<p className="mt-1" data-testid="insecure-note">{t('share.insecure')}</p>}
  {s.state==='connected'&&s.participants.length<=1&&<p className="mt-1" data-testid="alone-note">{t('share.alone')}</p>}
  {s.queued>0&&<p className="mt-1" data-testid="queued-note">{t('share.queued',{count:s.queued})}</p>}</div>;}
function People({s}:{s:CollabSnapshot}){
 const {t}=useT();
 return <><h3 className="mt-3 text-[12px] font-semibold">{t('share.people',{count:s.participants.length})}</h3>
  <ul className="mt-1 text-[12px]" data-testid="participants">{s.participants.map(p=><li key={p.id} className="flex items-center gap-2 py-0.5" data-testid="participant"><span aria-hidden className="size-2 rounded-full" style={{background:p.color}}/><span>{p.name}</span>{p.self&&<span className="text-ink-2">({t('share.you')})</span>}</li>)}</ul></>;}
function HostPane(){
 const {t}=useT();const s=useCollab();const eng=getCollabEngine();
 const lan=getLanHost();
 const [mode,setMode]=useState<'relay'|'lan-direct'>('relay');
 const [relay,setRelay]=useState(()=>{try{return localStorage.getItem(RELAY_URL_KEY)??'';}catch{return '';}});
 const [lanCfg,setLanCfg]=useState({lan:false,port:0});
 const rel=relay.trim()?relayRoomUrl(relay):null;const relBad=!!relay.trim()&&!rel;
 const portOk=Number.isInteger(lanCfg.port)&&lanCfg.port>=0&&lanCfg.port<=65535;
 const idle=s.role==='none';
 if(idle||s.state==='starting'&&s.role!=='host')return <div>
  <p className="mt-3 text-[12px] text-ink-2">{t('share.hostIntro')}</p>
  <div className="mt-3 flex gap-1" role="group" aria-label={t('share.mode')}>{(['relay','lan-direct'] as const).map(m=><Button key={m} size="compact" aria-pressed={mode===m} className={mode===m?'!bg-accent-soft !text-accent font-semibold':''} onClick={()=>setMode(m)}>{m==='relay'?t('share.modeRelay'):t('share.modeLan')}</Button>)}</div>
  {mode==='relay'?<div>
   <label className="mt-3 block text-[12px]">{t('share.relayUrl')}<input aria-label={t('share.relayUrl')} className={`${field} mt-1 font-mono`} placeholder="wss://relay.example.com" autoComplete="off" spellCheck={false} value={relay} onChange={e=>setRelay(e.target.value)}/></label>
   <p className="mt-1 text-[11px] text-ink-2">{t('share.relayHint')}</p>
   {relBad&&<p role="alert" className="mt-1 text-[11px] text-red-500" data-testid="relay-invalid">{t('share.invalidLink')}</p>}
   {rel&&!rel.secure&&!rel.local&&<p className="mt-1 text-[11px] text-ink-2" data-testid="relay-insecure">{t('share.relayInsecure')}</p>}</div>
  :lan?<LanHostSettings value={lanCfg} onChange={setLanCfg}/>
  :<p className="mt-3 text-[12px] text-ink-2" data-testid="lan-needs-desktop">{t('share.lanNeedsDesktop')}</p>}
  <p className="mt-3 text-[11px] text-ink-2">{t('share.noRoles')}</p><p className="mt-1 text-[11px] text-ink-2">{t('share.scope')}</p>
  {s.error&&<p role="alert" className="mt-2 text-[12px] text-red-500" data-testid="host-error">{errText(s.error,t)}</p>}
  <div className="mt-4 flex justify-end gap-2"><Button onClick={closeShare}>{t('dialogs.close')}</Button>
   <Button variant="primary" autoFocus disabled={mode==='relay'?!rel:(!lan||!portOk)} onClick={()=>{if(mode==='relay'){try{localStorage.setItem(RELAY_URL_KEY,relay.trim());}catch{/* storage unavailable */}void eng.startHosting({mode:'relay',relayUrl:relay});}else void eng.startHosting({mode:'lan-direct',lan:lanCfg.lan,port:lanCfg.port});}}>{t('share.start')}</Button></div></div>;
 return <div>
  <div data-testid="host-live"/>
  <StatusBlock s={s}/>
  {s.role==='host'&&s.state==='starting'&&<p className="mt-2 text-[12px] text-ink-2">{t('share.starting')}</p>}
  {s.noNetworkAddress&&<p className="mt-2 rounded-sm bg-hover p-2 text-[11px] text-ink-2" data-testid="lan-no-address">{t('share.lanNoAddress')}</p>}
  {s.guestLinks.length>0&&<p className="mt-2 text-[12px] text-ink-2">{t('share.sendLink')}</p>}
  {s.guestLinks.map((l,i)=><LinkRow key={l} testId={`link-guest-${i}`} label={t('share.linkGuests')} link={l}/>)}
  {s.localLink&&s.mode==='lan-direct'&&(s.guestLinks.length===0||s.noNetworkAddress)&&<LinkRow testId="link-local" label={t('share.linkLocal')} link={s.localLink}/>}
  <People s={s}/>
  <p className="mt-2 text-[11px] text-ink-2">{t('share.noRoles')}</p>
  <div className="mt-4 flex justify-end gap-2"><Button onClick={closeShare}>{t('dialogs.close')}</Button><Button onClick={()=>void eng.stopHosting()}>{t('share.stop')}</Button></div></div>;}
function JoinPane(){
 const {t}=useT();const s=useCollab();const [link,setLink]=useState('');const [name,setName]=useState('');const eng=getCollabEngine();
 const parsed=link.trim()?parseJoinLink(link):null;const bad=!!link.trim()&&!parsed;const busy=s.role==='guest'&&s.state==='connecting';
 if(s.role==='guest'&&s.state!=='error')return <div>
  <StatusBlock s={s}/>
  <p className="mt-3 text-[12px]" data-testid="guest-connected">{s.state==='connected'?t('share.joinedTo'):s.state==='reconnecting'?t('collab.reconnecting'):t('share.connecting')}</p>
  <People s={s}/>
  <div className="mt-4 flex justify-end gap-2"><Button onClick={closeShare}>{t('dialogs.close')}</Button><Button onClick={()=>void eng.leave()}>{t('share.leave')}</Button></div></div>;
 return <form onSubmit={e=>{e.preventDefault();if(parsed&&!busy)void eng.join(link,name);}}>
  <p className="mt-3 text-[12px] text-ink-2">{t('share.pasteHint')}</p>
  <input aria-label={t('share.inviteLink')} className={`${field} mt-2 font-mono`} placeholder="wss://..." autoComplete="off" spellCheck={false} value={link} onChange={e=>setLink(e.target.value)}/>
  {bad&&<p role="alert" className="mt-1 text-[11px] text-red-500" data-testid="link-invalid">{t('share.invalidLink')}</p>}
  {parsed&&isInsecureRemote(parsed)&&<p className="mt-1 text-[11px] text-ink-2" data-testid="join-insecure-note">{t('share.insecure')}</p>}
  {parsed&&!hasLinkKey(link)&&<p className="mt-1 text-[11px] text-ink-2" data-testid="join-no-key">{t('share.noKey')}</p>}
  <input aria-label={t('share.yourName')} className={`${field} mt-2`} placeholder={t('share.namePlaceholder')} maxLength={32} value={name} onChange={e=>setName(e.target.value)}/>
  <p className="mt-2 text-[11px] text-ink-2">{t('share.joinReplaces')}</p>
  {s.state==='error'&&s.error&&s.role==='none'&&<p role="alert" className="mt-2 text-[12px] text-red-500" data-testid="join-error" data-kind={s.error.kind}>{errText(s.error,t)}</p>}
  <div className="mt-4 flex justify-end gap-2"><Button type="button" onClick={closeShare}>{t('dialogs.close')}</Button><Button type="submit" variant="primary" disabled={!parsed||busy}>{busy?t('share.connecting'):t('share.join')}</Button></div></form>;}
/** Share / Join dialog. Opened from Tools > Share project... or Join shared project... */
export function ShareDialog(){
 const {t}=useT();const ui=useShareUi();
 return <Dialog open={ui.open} onOpenChange={o=>{if(!o)closeShare();}}><DialogContent className="confirm-dialog" aria-label={t('share.aria')}>
  <DialogTitle>{t('share.title')}</DialogTitle><DialogDescription className="sr-only">{t('share.desc')}</DialogDescription>
  <div className="mt-2 flex gap-1" role="group" aria-label={t('share.mode')}>{(['host','join'] as const).map(m=><Button key={m} size="compact" aria-pressed={ui.tab===m} className={ui.tab===m?'!bg-accent-soft !text-accent font-semibold':''} onClick={()=>setShareTab(m)}>{m==='host'?t('share.tabHost'):t('share.tabJoin')}</Button>)}</div>
  {ui.tab==='host'?<HostPane/>:<JoinPane/>}</DialogContent></Dialog>;}
