import {useChatSession} from '../lib/collab/chatSession';
import {openSessionChat} from '../lib/collab/communication';
import {useCollab,openShare} from '../lib/collab/store';
import {useT} from '../lib/useT';
import type {CollabSnapshot} from '../lib/collab/types';
/** The one honest label for a snapshot: connection state, where the bytes go, who is here. Every part comes from the snapshot. */
export function collabLabel(s:CollabSnapshot,t:(k:string,p?:Record<string,string|number>)=>string):{label:string;tone:string;detail:string}|null{
 if(s.role==='none'&&s.state!=='error')return null;
 if(s.role==='none')return null;
 const state=s.state==='connected'?t('collab.connected'):s.state==='reconnecting'?t('collab.reconnecting'):(s.state==='connecting')?t('collab.connecting'):s.state==='starting'?t('collab.starting'):t('collab.disconnected');
 const tone=s.state==='connected'?'bg-emerald-500':s.state==='error'||s.state==='off'?'bg-red-500':'bg-amber-500';
 const mode=s.mode==='lan-direct'?t('collab.lan'):s.mode==='relay'?t('collab.relay'):'';
 const n=s.participants.length;
 const parts=[state,mode,s.state==='connected'&&n>0?t('collab.people',{count:n}):''].filter(Boolean);
 const sec=s.security?(s.security.e2e?t('collab.e2e',{fp:s.security.fingerprint??''}):t('collab.noE2e')):'';
 const m=s.media;
 const media=m&&(m.shared>0||m.failed.length>0)?t('collab.media',{shared:m.shared,received:m.received,pending:m.pending,failed:m.failed.length}):'';
 const detail=[sec,media].filter(Boolean).join('. ');
 return {label:parts.join(' \u00b7 '),tone,detail};}
/** Status bar pill. Hidden when nothing is shared or joined, so the bar stays quiet. */
export function CollabStatus(){
 const {t}=useT();const s=useCollab();const chat=useChatSession();
 const l=collabLabel(s,t);if(!l)return null;
 return <span className="collab-pill"><button type="button" data-testid="collab-status" data-state={s.state} data-mode={s.mode??''} title={l.detail} aria-label={t('collab.aria',{label:`${l.label}. ${l.detail}`})} onClick={()=>openShare(s.role==='guest'?'join':'host')} className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border-0 bg-hover px-2 py-0.5 text-[10px] text-ink"><span aria-hidden className={`size-2 rounded-full ${l.tone}`}/>{l.label}</button>{chat&&<button className="collab-chat-open" aria-label={t('chat.open')} title={t('chat.open')} onClick={openSessionChat}><svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 2h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7l-4 3v-3H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.4"/></svg>{chat.unread>0&&<span className="collab-unread">{chat.unread>9?'9+':chat.unread}</span>}</button>}</span>;}
