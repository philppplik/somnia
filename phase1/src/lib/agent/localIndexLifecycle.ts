import {localOrigin} from './localModels';
export interface LocalIndexDescriptor {endpoint:string;model:string;digest:string;dimensions:number;sources:readonly {id:string;revision:string}[]}
export interface LocalIndexLifecycle {generation:number;phase:'empty'|'building'|'ready'|'invalid';descriptor:LocalIndexDescriptor|null}
const id=(s:string)=>{if(typeof s!=='string'||!s.trim()||new TextEncoder().encode(s).length>512||/[\x00-\x1f\x7f\uD800-\uDFFF]/u.test(s))throw Error('Invalid index identity');};
const exact=(v:object,keys:string[])=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))throw Error('Invalid index metadata');};
/** Canonical detached descriptor, no content/hash discovery or provider verification. */
export function captureLocalIndexDescriptor(input:LocalIndexDescriptor):LocalIndexDescriptor{
 exact(input,['endpoint','model','digest','dimensions','sources']);id(input.model);id(input.digest);
 if(/(^|[:\-_/])cloud$/i.test(input.model.trim())||!Number.isSafeInteger(input.dimensions)||input.dimensions<1||input.dimensions>4096||!Array.isArray(input.sources)||input.sources.length<1||input.sources.length>32)throw Error('Invalid index model/dimensions/sources');
 const ids=new Set<string>();const sources=input.sources.map(s=>{exact(s,['id','revision']);id(s.id);if(s.id.length>100)throw Error('Index source ID exceeds chunker limit');id(s.revision);if(ids.has(s.id))throw Error('Duplicate index source');ids.add(s.id);return Object.freeze({id:s.id,revision:s.revision});});
 return Object.freeze({endpoint:localOrigin(input.endpoint),model:input.model,digest:input.digest,dimensions:input.dimensions,sources:Object.freeze(sources)});
}
export const emptyLocalIndex=():LocalIndexLifecycle=>Object.freeze({generation:0,phase:'empty',descriptor:null});
function validState(s:LocalIndexLifecycle){exact(s,['generation','phase','descriptor']);if(!Number.isSafeInteger(s.generation)||s.generation<0||!['empty','building','ready','invalid'].includes(s.phase)||(s.phase==='building'||s.phase==='ready')!==!!s.descriptor)throw Error('Invalid index lifecycle');if(s.descriptor)captureLocalIndexDescriptor(s.descriptor);}
export function beginLocalIndex(state:LocalIndexLifecycle,descriptor:LocalIndexDescriptor):LocalIndexLifecycle{validState(state);if(state.generation===Number.MAX_SAFE_INTEGER)throw Error('Index generation exhausted');return Object.freeze({generation:state.generation+1,phase:'building',descriptor:captureLocalIndexDescriptor(descriptor)});}
/** Cancels only descriptor authority, host still cancels network and releases vectors. */
export function invalidateLocalIndex(state:LocalIndexLifecycle):LocalIndexLifecycle{validState(state);return Object.freeze({generation:state.generation,phase:'invalid',descriptor:null});}
export function finishLocalIndex(state:LocalIndexLifecycle,generation:number,current:LocalIndexDescriptor):LocalIndexLifecycle{validState(state);if(state.phase!=='building'||generation!==state.generation)throw Error('Stale index completion');const captured=captureLocalIndexDescriptor(current);return JSON.stringify(state.descriptor)===JSON.stringify(captured)?Object.freeze({generation:state.generation,phase:'ready',descriptor:captured}):invalidateLocalIndex(state);}
export function assertLocalIndexReady(state:LocalIndexLifecycle,current:LocalIndexDescriptor):void{validState(state);if(state.phase!=='ready'||JSON.stringify(state.descriptor)!==JSON.stringify(captureLocalIndexDescriptor(current)))throw Error('Index unavailable or stale; explicit rebuild required');}
