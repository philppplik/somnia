import type {DocumentSnapshot} from './documentCore';
import {AgentToolRegistry,type AgentToolSpec} from './toolRegistry';
import {parseDeck,serializeDeck,proposeDeck} from '../slides/deckDocument';
export {parseDeck,serializeDeck} from '../slides/deckDocument';
/** Integrator adds 'slides' to StudioKind and .pptx to studioFor; shared files deliberately untouched. */
export const deckAdapter={id:'deck-text-v1',kind:'slides' as const,validate(text:string){parseDeck(text);}};
export interface DeckToolHost {snapshot():DocumentSnapshot;propose(after:string):void}
const obj=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',properties,required,additionalProperties:false});
export function createDeckStudioRegistry(host:DeckToolHost):AgentToolRegistry {
 const snap=()=>{const s=host.snapshot();if(String(s.ref.studioKind)!=='slides'||s.ref.adapter!==deckAdapter.id)throw Error('Unsupported studio.');return {s,doc:parseDeck(s.text)};};
 const spec=(name:string,level:'read'|'propose',description:string,properties:Record<string,unknown>,required:string[],run:AgentToolSpec['run']):AgentToolSpec=>({level,definition:{name,description,parameters:obj(properties,required)},run:async(a,c,sig)=>{sig.throwIfAborted();if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!Object.hasOwn(properties,k)))throw Error('Unexpected Deck arguments.');return run(a,c,sig);}});
 return new AgentToolRegistry()
 .register(spec('deck_inspect','read','Inspect canonical PPTX slide data, dimensions, layouts, text runs and read-only notes as JSON. No binary data, images, URLs, XML or external fetches. Noncanonical decks remain preview-only.',{},[],async()=>{const {s,doc}=snap();return JSON.stringify({document:{documentId:s.ref.documentId,revision:s.ref.revision,adapter:s.ref.adapter},deck:doc,trust:'untrusted-document',limits:{editable:'canonical-text-runs-only',layouts:'read-only',notes:'read-only'},binaryDisclosed:false});}))
 .register(spec('deck_propose_changes','propose','Stage up to 100 partial text-run changes for user review. Zero-based slide/run indexes from deck_inspect. No layout or notes changes. Never applies or saves.',{changes:{type:'array',minItems:1,maxItems:100,items:obj({slide:{type:'integer',minimum:0},run:{type:'integer',minimum:0},text:{type:'string',description:'At most 16 KiB UTF-8, XML-safe characters.'}},['slide','run','text'])}},['changes'],async(a,_c,sig)=>{const {s,doc}=snap(),after=serializeDeck(proposeDeck(doc,a));sig.throwIfAborted();const fresh=host.snapshot();if(fresh.ref.documentId!==s.ref.documentId||fresh.ref.revision!==s.ref.revision||fresh.text!==s.text)throw Error('Deck changed before staging.');host.propose(after);return 'Staged for review. Nothing is applied or saved until the user accepts.';}));
}
