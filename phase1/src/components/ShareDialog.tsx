import {useRef,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {useT} from '../lib/useT';
import {useCollab,useShareUi,closeShare,setShareTab,getCollabEngine} from '../lib/collab/store';
import {parseJoinLink,isInsecureRemote,hasLinkKey,maskLink,relayRoomUrl,RELAY_URL_KEY} from '../lib/collab/invite';
import {getLanHost} from '../lib/collab/lanHostPort';
import {collabLabel} from './CollabStatus';
import {LanHostSettings} from './LanHostSettings';
import type {CollabSnapshot,CollabError} from '../lib/collab/types';
import {getProfile,updateProfile} from '../lib/account';
import {checkSessionName,SESSION_NAME_MAX,type NameCheck} from '../lib/collab/identity';
import {initialOf} from '../lib/collab/badgePolicy';
import '../lib/collab/commands';
const nameMsg=(c:NameCheck,t:T)=>c.ok?'':c.reason==='empty'?t('share.nameEmpty'):c.reason==='long'?t('share.nameTooLong',{max:SESSION_NAME_MAX}):t('share.nameInvalid');
/** 36px preview of the local picture (or initials) next to a labelled name input. The picture is read-only here; it is edited in the local profile settings. */
function IdentityRow({name,onName,disabled,error,hint,inputRef,id}:{name:string;onName:(v:string)=>void;disabled?:boolean;error:string;hint:string;inputRef?:React.Ref<HTMLInputElement>;id:string}){
 const {t}=useT();const avatar=getProfile().avatar;
 return <div className="mt-3" data-testid="identity">
  <h3 className="text-[12px] font-semibold">{t('share.identity')}</h3>
  <div className="mt-1.5 flex items-start gap-2.5">
   <span aria-hidden className="mt-[18px] inline-flex size-9 flex-none items-center justify-center overflow-hidden rounded-full bg-accent-soft text-[13px] font-semibold text-accent" data-testid="identity-avatar" data-kind={avatar?'image':'initials'}>{avatar?<img alt="" src={avatar} className="size-full object-cover"/>:initialOf(name||'?')}</span>
   <label className="block min-w-0 flex-1 text-[12px]" htmlFor={id}>{t('share.yourName')}
    <input id={id} ref={inputRef} style={error?{borderColor:'var(--danger)'}:undefined} className={`${field} mt-1`} autoComplete="off" spellCheck={false} disabled={disabled} aria-invalid={!!error} aria-describedby={`${id}-hint ${id}-count`} value={name} onChange={e=>onName(e.target.value)}/></label></div>
  <p className="mt-1 flex justify-between gap-2 text-[11px] text-ink-2"><span id={`${id}-hint`} data-testid="identity-hint">{hint}</span><span id={`${id}-count`} data-testid="identity-count">{t('share.nameCount',{count:name.trim().length,max:SESSION_NAME_MAX})}</span></p>
  {error&&<p role="alert" className="mt-1 text-[11px]" style={{color:'var(--danger)'}} data-testid="identity-error">{error}</p>}</div>;}
const field='h-9 w-full rounded-sm border border-line bg-elevated px-2.5 text-[12px] text-ink';
type T=(k:string,p?:Record<string,string|number>)=>string;
// Error messages from the engine and operating system are diagnostics, not catalogue text.
// Show the translated message for the stable error kind instead of leaking English diagnostics into the UI.
const errText=(e:CollabError,t:T)=>t(`share.err.${e.kind}`);
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
  {s.error&&<p role="alert" className="mt-2 text-red-500" data-testid="session-error">{errText(s.error,t)}</p>}
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
 const [minutes,setMinutes]=useState(60);
 const [lanCfg,setLanCfg]=useState({lan:false,port:0});
 const nick=getProfile().nickname.trim();const nickOk=!nick||checkSessionName(nick).ok;
 const [hostName,setHostName]=useState(nick);const hostCheck=checkSessionName(hostName);
 const nameBlocked=!nickOk&&!hostCheck.ok;
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
  {!nickOk&&<><p className="mt-3 text-[11px] text-ink-2" data-testid="host-name-long">{t('share.hostNameLong',{max:SESSION_NAME_MAX})}</p><IdentityRow id="host-name" name={hostName} onName={setHostName} error={hostCheck.ok?'':nameMsg(hostCheck,t)} hint={t('share.discloseName')}/></>}
  <label className="mt-3 block text-[12px]">{t('share.sessionDuration')}<select className={`${field} mt-1`} aria-label={t('share.sessionDuration')} value={minutes} onChange={e=>setMinutes(Number(e.target.value))}>{[15,60,240,1440].map(n=><option key={n} value={n}>{t('share.durationMinutes',{count:n})}</option>)}</select></label>
  <p className="mt-3 text-[11px] text-ink-2">{t('share.noRoles')}</p><p className="mt-1 text-[11px] text-ink-2">{t('share.scope')}</p>
  {s.error&&<p role="alert" className="mt-2 text-[12px] text-red-500" data-testid="host-error">{errText(s.error,t)}</p>}
  <div className="mt-4 flex justify-end gap-2"><Button onClick={closeShare}>{t('dialogs.close')}</Button>
   <Button variant="primary" autoFocus disabled={nameBlocked||(mode==='relay'?!rel:(!lan||!portOk))} onClick={()=>{if(mode==='relay'){try{localStorage.setItem(RELAY_URL_KEY,relay.trim());}catch{/* storage unavailable */}void eng.startHosting({mode:'relay',relayUrl:relay,sessionMinutes:minutes,...(!nickOk&&hostCheck.ok?{displayName:hostCheck.name}:{})});}else void eng.startHosting({mode:'lan-direct',lan:lanCfg.lan,port:lanCfg.port,sessionMinutes:minutes,...(!nickOk&&hostCheck.ok?{displayName:hostCheck.name}:{})});}}>{t('share.start')}</Button></div></div>;
 return <div>
  <div data-testid="host-live"/>
  <StatusBlock s={s}/>
  {s.role==='host'&&s.state==='starting'&&<p className="mt-2 text-[12px] text-ink-2">{t('share.starting')}</p>}
  {s.noNetworkAddress&&<p className="mt-2 rounded-sm bg-hover p-2 text-[11px] text-ink-2" data-testid="lan-no-address">{t('share.lanNoAddress')}</p>}
  {s.guestLinks.length>0&&<p className="mt-2 text-[12px] text-ink-2">{t('share.sendLink')}</p>}
  {s.guestLinks.map((l,i)=><LinkRow key={l} testId={`link-guest-${i}`} label={t('share.linkGuests')} link={l}/>)}
  {s.localLink&&s.mode==='lan-direct'&&(s.guestLinks.length===0||s.noNetworkAddress)&&<LinkRow testId="link-local" label={t('share.linkLocal')} link={s.localLink}/>}
  {s.expiresAt&&<p className="mt-2 text-[11px] text-ink-2" data-testid="session-expiry">{t('share.expiresAt',{time:new Date(s.expiresAt).toLocaleString()})}</p>}
  <People s={s}/>
  <p className="mt-2 text-[11px] text-ink-2">{t('share.noRoles')}</p>
  <p className="mt-2 text-[11px] text-ink-2">{t('share.endLimits')}</p>
  <div className="mt-4 flex justify-end gap-2"><Button onClick={closeShare}>{t('dialogs.close')}</Button><Button onClick={()=>void eng.stopHosting()}>{t('share.stop')}</Button></div></div>;}
function JoinPane(){
 const {t}=useT();const s=useCollab();const [link,setLink]=useState('');const [name,setName]=useState(()=>getProfile().nickname);const eng=getCollabEngine();
 const [touched,setTouched]=useState(false);const [saveFailed,setSaveFailed]=useState(false);const [retried,setRetried]=useState(false);
 const pending=useRef<string|null>(null);const submitting=useRef(false);
 const parsed=link.trim()?parseJoinLink(link):null;const bad=!!link.trim()&&!parsed;const busy=s.role==='guest'&&s.state==='connecting';
 const check=checkSessionName(name);const profileEmpty=!getProfile().nickname.trim();const hasAvatar=!!getProfile().avatar;
 // A prefilled over-long profile name is explained at once; an empty field only after a submit attempt.
 const showErr=!check.ok&&(touched||check.reason==='long');
 const saveName=()=>{const n=pending.current;if(!n)return true;if(getProfile().nickname.trim()){pending.current=null;return true;}const ok=updateProfile({nickname:n});if(ok)pending.current=null;return ok;};
 const submit=async(e:React.FormEvent)=>{e.preventDefault();if(busy||submitting.current)return;setTouched(true);if(!parsed||!check.ok)return;
  submitting.current=true;const wasEmpty=!getProfile().nickname.trim();const chosen=check.name;
  try{await eng.join(link,chosen);}finally{submitting.current=false;}
  const snap=eng.snapshot();
  // Save an empty profile's name only once the session is connected; cancelled or failed joins leave the profile alone.
  if(wasEmpty&&snap.role==='guest'&&snap.state==='connected'){pending.current=chosen;setSaveFailed(!saveName());}};
 if(s.role==='guest')return <div>
  <StatusBlock s={s}/>
  <p className="mt-3 text-[12px]" data-testid="guest-connected">{s.state==='connected'?t('share.joinedTo'):s.state==='reconnecting'?t('collab.reconnecting'):s.state==='error'?t('collab.disconnected'):t('share.connecting')}</p>
  {saveFailed&&<p role="status" className="mt-2 text-[11px] text-ink-2" data-testid="name-save-failed">{t('share.nameSaveFailed')} {!retried&&<Button size="compact" onClick={()=>{setRetried(true);setSaveFailed(!saveName());}}>{t('share.retrySave')}</Button>}</p>}
  {s.avatarShareFailed&&<p role="status" className="mt-2 text-[11px] text-ink-2" data-testid="avatar-share-failed">{t('share.avatarNotShared')}</p>}
  {s.expiresAt&&<p className="mt-2 text-[11px] text-ink-2" data-testid="session-expiry">{t('share.expiresAt',{time:new Date(s.expiresAt).toLocaleString()})}</p>}
  <People s={s}/>
  <div className="mt-4 flex justify-end gap-2"><Button onClick={closeShare}>{t('dialogs.close')}</Button><Button onClick={()=>void eng.leave()}>{t('share.leave')}</Button></div></div>;
 return <form onSubmit={e=>void submit(e)}>
  <p className="mt-3 text-[12px] text-ink-2">{t('share.pasteHint')}</p>
  <input aria-label={t('share.inviteLink')} className={`${field} mt-2 font-mono`} placeholder="wss://..." autoComplete="off" spellCheck={false} autoFocus disabled={busy} value={link} onChange={e=>setLink(e.target.value)}/>
  {bad&&<p role="alert" className="mt-1 text-[11px] text-red-500" data-testid="link-invalid">{t('share.invalidLink')}</p>}
  {parsed&&isInsecureRemote(parsed)&&<p className="mt-1 text-[11px] text-ink-2" data-testid="join-insecure-note">{t('share.insecure')}</p>}
  {parsed&&!hasLinkKey(link)&&<p className="mt-1 text-[11px] text-ink-2" data-testid="join-no-key">{t('share.noKey')}</p>}
  <IdentityRow id="join-name" name={name} onName={v=>setName(v)} disabled={busy} error={showErr?nameMsg(check,t):''} hint={profileEmpty?t('share.nameWillSave'):t('share.nameFromProfile')}/>
  <p className="mt-2 text-[11px] text-ink-2" data-testid="identity-disclosure">{hasAvatar?t('share.discloseAvatar'):t('share.discloseName')}</p>
  <p className="mt-2 text-[11px] text-ink-2">{t('share.joinReplaces')}</p>
  <p className="mt-2 text-[11px] text-ink-2">{t('share.noRoles')}</p>
  {s.state==='error'&&s.error&&s.role==='none'&&<p role="alert" className="mt-2 text-[12px] text-red-500" data-testid="join-error" data-kind={s.error.kind}>{errText(s.error,t)}</p>}
  <div className="mt-4 flex justify-end gap-2"><Button type="button" onClick={closeShare}>{t('dialogs.close')}</Button><Button type="submit" variant="primary" disabled={!parsed||busy}>{busy?t('share.joining'):t('share.join')}</Button></div></form>;}
/** Share / Join dialog. Opened from Tools > Share project... or Join shared project... */
export function ShareDialog(){
 const {t}=useT();const ui=useShareUi();
 return <Dialog open={ui.open} onOpenChange={o=>{if(!o)closeShare();}}><DialogContent className="confirm-dialog" aria-label={t('share.aria')}>
  <DialogTitle>{t('share.title')}</DialogTitle><DialogDescription className="sr-only">{t('share.desc')}</DialogDescription>
  <div className="mt-2 flex gap-1" role="group" aria-label={t('share.mode')}>{(['host','join'] as const).map(m=><Button key={m} size="compact" aria-pressed={ui.tab===m} className={ui.tab===m?'!bg-accent-soft !text-accent font-semibold':''} onClick={()=>setShareTab(m)}>{m==='host'?t('share.tabHost'):t('share.tabJoin')}</Button>)}</div>
  {ui.tab==='host'?<HostPane/>:<JoinPane/>}</DialogContent></Dialog>;}
