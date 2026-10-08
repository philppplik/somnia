import type {AgentEvent, AgentProposal,AgentApproval} from './core';
export type ProposalState = 'pending' | 'accepted' | 'rejected' | 'undone';
export type ChatItem =
 | {id: string; kind: 'user'; text: string}
 | {id: string; kind: 'agent'; text: string; streaming: boolean; incomplete?: 'stopped' | 'error'}
 | {id: string; kind: 'status'; text: string; file?: string}
 | {id: string; kind: 'diff'; proposal: AgentProposal; state: ProposalState}
 | {id:string;kind:'approval';approval:AgentApproval}
 | {id:string;kind:'usage';text:string}
 | {id:string;kind:'stopped';text:string}
 | {id: string; kind: 'error'; text: string; retryable?: boolean};
export interface ChatState {items: ChatItem[]; busy: boolean; seq: number}
export const initialChat: ChatState = {items: [], busy: false, seq: 0};
export type ChatAction =
 | {type: 'send'; text: string}
 | {type: 'event'; event: AgentEvent}
 | {type: 'stop'}
 | {type: 'resolve'; proposalId: string; state: ProposalState}
 | {type: 'reset'};
const next = (s: ChatState) => `m${s.seq + 1}`;
/** Drops the transient status row and ends streaming on the last agent bubble. */
function settle(items: ChatItem[], incomplete?: 'stopped' | 'error'): ChatItem[] {
 return items.filter(i => i.kind !== 'status').map(i => i.kind === 'agent' && i.streaming ? {...i, streaming: false, ...(incomplete ? {incomplete} : {})} : i);
}
export function chatReducer(s: ChatState, a: ChatAction): ChatState {
 switch (a.type) {
  case 'send': {
   const text = a.text.trim();if (!text || s.busy) return s;
   return {items: [...s.items, {id: next(s), kind: 'user', text}], busy: true, seq: s.seq + 1};
  }
  case 'event': {
   const e = a.event;if (!s.busy && e.type!=='error') return s;
   if (e.type === 'status') return {...s, items: [...s.items.filter(i => i.kind !== 'status'), {id: next(s), kind: 'status', text: e.text, file: e.file}], seq: s.seq + 1};
   if (e.type === 'text-delta') {
    if (!e.text) return s;
    const active = s.items.find(i => i.kind === 'agent' && i.streaming);
    if (active && active.kind === 'agent') return {...s, items: s.items.filter(i => i.kind !== 'status').map(i => i.id === active.id ? {...active, text: active.text + e.text} : i)};
    return {...s, items: [...s.items.filter(i => i.kind !== 'status'), {id: next(s), kind: 'agent', text: e.text, streaming: true}], seq: s.seq + 1};
   }
   if (e.type === 'proposal') return {...s, items: [...settle(s.items), {id: next(s), kind: 'diff', proposal: e.proposal, state: 'pending'}], seq: s.seq + 1};
   if (e.type === 'approval') return {...s,items:[...settle(s.items),{id:next(s),kind:'approval',approval:e.approval}],seq:s.seq+1};
   if (e.type === 'usage') return {...s,items:[...s.items,{id:next(s),kind:'usage',text:`Tokens: ${e.inputTokens??'?'} in / ${e.outputTokens??'?'} out. Cost: ${e.costUsd===undefined?'unknown':`$${e.costUsd}`}`}],seq:s.seq+1};
   if (e.type === 'done') return {...s, items: settle(s.items), busy: false};
   return {items: [...settle(s.items,'error'), {id: next(s), kind: 'error', text: e.message + (s.busy && s.items.some(i => i.kind === 'agent' && i.streaming) ? ' The partial response above was kept, but is incomplete. Retry starts the request again; provider costs may still occur.' : ''), retryable: e.retryable}], busy: false, seq: s.seq + 1};
  }
  case 'stop': return s.busy ? {...s, items: [...settle(s.items,'stopped'), {id:next(s),kind:'stopped',text:'Generation stopped. No changes from this turn were applied.'}], busy:false,seq:s.seq+1} : s;
  case 'resolve': return {...s, items: s.items.map(i => i.kind === 'diff' && i.proposal.id === a.proposalId ? {...i, state: a.state} : i)};
  case 'reset': return {...initialChat, seq: s.seq};
 }
}
