import type {AgentEvent, AgentProposal,AgentApproval} from './core';
export type ProposalState = 'pending' | 'accepted' | 'rejected';
export type ChatItem =
 | {id: string; kind: 'user'; text: string}
 | {id: string; kind: 'agent'; text: string; streaming: boolean}
 | {id: string; kind: 'status'; text: string; file?: string}
 | {id: string; kind: 'diff'; proposal: AgentProposal; state: ProposalState}
 | {id:string;kind:'approval';approval:AgentApproval}
 | {id:string;kind:'usage';text:string}
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
function settle(items: ChatItem[]): ChatItem[] {
 return items.filter(i => i.kind !== 'status').map(i => i.kind === 'agent' && i.streaming ? {...i, streaming: false} : i);
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
    const last = s.items[s.items.length - 1];
    if (last && last.kind === 'agent' && last.streaming) return {...s, items: [...s.items.slice(0, -1), {...last, text: last.text + e.text}]};
    return {...s, items: [...s.items.filter(i => i.kind !== 'status'), {id: next(s), kind: 'agent', text: e.text, streaming: true}], seq: s.seq + 1};
   }
   if (e.type === 'proposal') return {...s, items: [...settle(s.items), {id: next(s), kind: 'diff', proposal: e.proposal, state: 'pending'}], seq: s.seq + 1};
   if (e.type === 'approval') return {...s,items:[...s.items,{id:next(s),kind:'approval',approval:e.approval}],seq:s.seq+1};
   if (e.type === 'usage') return {...s,items:[...s.items,{id:next(s),kind:'usage',text:`Tokens: ${e.inputTokens??'?'} in / ${e.outputTokens??'?'} out. Cost: ${e.costUsd===undefined?'unknown':`$${e.costUsd}`}`}],seq:s.seq+1};
   if (e.type === 'done') return {...s, items: settle(s.items), busy: false};
   return {items: [...settle(s.items), {id: next(s), kind: 'error', text: e.message, retryable: e.retryable}], busy: false, seq: s.seq + 1};
  }
  case 'stop': return {...s, items: settle(s.items), busy: false};
  case 'resolve': return {...s, items: s.items.map(i => i.kind === 'diff' && i.proposal.id === a.proposalId ? {...i, state: a.state} : i)};
  case 'reset': return {...initialChat, seq: s.seq};
 }
}
