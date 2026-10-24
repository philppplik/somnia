import {parseDeck,proposeDeck,serializeDeck} from '../slides/deckDocument';
import type {ReviewedApply} from '../slides/deckReceipt';
import type {SlideTextPreview} from './slidesMultiTextPort';
export interface SlidesMultiOwnerSnapshot {text:string;identity:string;generation:number;revision:number}
/** Pure host-private preparation, not an execution grant. Never returned to the model. */
export function planReviewedSlideText(preview:SlideTextPreview,owner:SlidesMultiOwnerSnapshot):ReviewedApply {
 const p=structuredClone(preview),s=structuredClone(owner),t=p.target;
 if(!t.documentId||!t.path||!s.identity||!Number.isSafeInteger(t.slide)||t.slide<0||!Number.isSafeInteger(t.generation)||t.generation<1||!Number.isSafeInteger(t.revision)||t.revision<0||s.generation!==t.generation||s.revision!==t.revision)throw Error('Native slide changed since preview.');
 if(!p.changes.length||p.changes.length>20||new Set(p.changes.map(c=>c.run)).size!==p.changes.length)throw Error('Invalid multi-text review.');
 const deck=parseDeck(s.text),slide=deck.slides[t.slide];if(!slide)throw Error('Reviewed slide unavailable.');
 let bytes=0;
 for(const c of p.changes){
  if(!Number.isSafeInteger(c.run)||c.run<0||typeof c.before!=='string'||typeof c.after!=='string'||new TextEncoder().encode(c.before).length>4096||new TextEncoder().encode(c.after).length>4096||(bytes+=new TextEncoder().encode(c.after).length)>16384)throw Error('Invalid reviewed slide text.');
  if(slide.texts[c.run]?.run!==c.run||slide.texts[c.run]?.text!==c.before)throw Error('Native text run changed since preview.');
 }
 const after=proposeDeck(deck,{changes:p.changes.map(c=>({slide:t.slide,run:c.run,text:c.after}))});
 return {expectedText:s.text,afterText:serializeDeck(after),identity:s.identity,generation:s.generation,revision:s.revision};
}
