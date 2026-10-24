import {classify} from '../studios/openResolver';
import {readyHandlersFor} from '../studios/openHandlers';
export function textStudioLinks(path:string,text:string){const c=classify(path,new TextEncoder().encode(text));if(!c.kind||c.error||c.unsupported)return[];return [...new Set(readyHandlersFor(c.kind).filter(h=>h.capability==='edit').map(h=>h.studioId))];}
