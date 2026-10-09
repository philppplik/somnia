/** Module-only reviewed transaction bridge. Integrator must await apply/undo before marking accepted. */
import {getDeckSession,applyDeckSession,subscribeSlides} from '../slides/session';
import {getMedia} from '../media';
import {parseDeck,serializeDeck} from './deckStudio';
const applied=new Map<string,{origin:string;before:string;after:string;identity:string;revision:number;beforeRevision:number}[]>();
export const subscribeDecks=subscribeSlides;
let revision=0;subscribeSlides(()=>{revision++;});
export const deckRevision=()=>revision;
export function getDeck(path:string){const s=getDeckSession(path);return s?{path,...s}:null;}
export function deckFiles(){const files:Record<string,string>={};for(const m of getMedia().items){if(m.kind!=='pptx')continue;try{const e=getDeck(m.name);if(e)files[m.name]=e.text;}catch{/* Noncanonical deck remains preview-only. */}}return files;}
export function assertDeck(path:string){const e=getDeck(path);if(!e)throw Error('Deck is no longer open or still loading.');return e;}
export async function applyDeck(path:string,text:string,origin:string,expected=assertDeck(path)){
 if(typeof origin!=='string'||!origin.startsWith('ai:'))throw Error('AI origin required.');const after=serializeDeck(parseDeck(text));
 const rev=await applyDeckSession(path,after,expected),e=assertDeck(path);if(e.identity!==expected.identity)throw Error('Deck identity changed.');
 const stack=applied.get(path)??[];stack.push({origin,before:expected.text,after,identity:e.identity,revision:rev,beforeRevision:expected.revision});applied.set(path,stack);
}
/** Revision, not text equality: manual edit+revert also forbids overwriting the user's history. */
export async function undoDeck(path:string,origin:string){const e=assertDeck(path),stack=applied.get(path)??[],head=stack.at(-1);
 if(!head||head.origin!==origin)throw Error('A later AI change exists. Undo it first.');
 if(e.identity!==head.identity||e.revision!==head.revision||e.text!==head.after)throw Error('Deck changed after this AI edit. Not restoring over your edits.');
 await applyDeckSession(path,head.before,e);stack.pop();const previous=stack.at(-1);if(previous&&previous.identity===e.identity&&previous.revision===head.beforeRevision)previous.revision=assertDeck(path).revision;
}
export const forgetDeck=(path:string)=>{applied.delete(path);};
