import {utf8ToUtf16Offset} from './text';import type {DocumentsState} from './store';
export interface DocumentSelectionCapture {version:1;generation:number;identity:string;name:string;revision:number;block:number;anchor:number;head:number;start:number;end:number;text:string}
/** Builder extraction only, no provider/DTO/apply authority. Engine generation and
 * identity originate at attachment; revision/selection originate in live store. */
export function captureDocumentSelection(state:DocumentsState,owner:{generation:number;identity:string}|null):DocumentSelectionCapture{
 const c=state.caret;if(!owner||!Number.isSafeInteger(owner.generation)||owner.generation<1||!owner.identity||owner.identity.length>512||/[\x00-\x1f\x7f]/.test(owner.identity)||state.status!=='ready'||state.saving||state.caretLocked||!state.name||!Number.isSafeInteger(state.rev)||state.rev<0||!c||!Number.isSafeInteger(c.block)||c.block<0||!Number.isSafeInteger(c.anchor)||!Number.isSafeInteger(c.head)||c.anchor<0||c.head<0||c.anchor===c.head)throw Error('Document selection unavailable');
 const blocks=state.blocks.filter(b=>b.index===c.block),b=blocks[0];if(blocks.length!==1||b.kind!=='para'||!b.editable||typeof b.text!=='string')throw Error('Document selection not editable paragraph');
 const start=Math.min(c.anchor,c.head),end=Math.max(c.anchor,c.head);const text=b.text.slice(utf8ToUtf16Offset(b.text,start),utf8ToUtf16Offset(b.text,end));if(!text.trim()||new TextEncoder().encode(text).length>4096||/[\uD800-\uDFFF\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(text))throw Error('Invalid selected document text');
 return Object.freeze({version:1,generation:owner.generation,identity:owner.identity,name:state.name,revision:state.rev,block:c.block,anchor:c.anchor,head:c.head,start,end,text});
}
export function assertDocumentSelectionCurrent(expected:DocumentSelectionCapture,current:DocumentSelectionCapture){if(JSON.stringify(expected)!==JSON.stringify(current))throw Error('Document selection changed; capture again');}
