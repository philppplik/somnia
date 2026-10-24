import {buildOfficeLocalPrompt,type OfficePromptInput} from './officeLocalPrompt';
export interface OfficeSelectionSnapshot {
 kind:OfficePromptInput['kind'];documentId:string;revision:number;selectionId:string;
 targets:readonly {id:string;text:string}[];
}
export interface OfficeReviewProposal {
 version:1;state:'awaiting-review';mode:'rewrite'|'summary';snapshot:OfficeSelectionSnapshot;
 replacements:readonly {targetId:string;before:string;after:string}[];summary:string|null;
 applied:false;adapterRequired:true;
}
const bytes=(s:string)=>new TextEncoder().encode(s).length;
const invalidText=(s:string)=>/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\uD800-\uDFFF]/u.test(s);
function exact(value:object,keys:readonly string[]){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw Error('Invalid Office contract fields');}
function identifier(s:string){if(typeof s!=='string'||!s.trim()||bytes(s)>512||/[\x00-\x1f\x7f\uD800-\uDFFF]/u.test(s))throw Error('Invalid Office identity');}
/** Host-supplied identity only. No source discovery or widening a cell into a range. */
export function captureOfficeSelection(input:OfficeSelectionSnapshot):OfficeSelectionSnapshot {
 exact(input,['kind','documentId','revision','selectionId','targets']);
 if(!['documents','slides','sheets'].includes(input.kind)||!Number.isSafeInteger(input.revision)||input.revision<0)throw Error('Invalid Office revision/kind');
 identifier(input.documentId);identifier(input.selectionId);
 if(!Array.isArray(input.targets)||!input.targets.length||input.targets.length>100)throw Error('Invalid Office selection');
 const ids=new Set<string>();const targets=input.targets.map(t=>{exact(t,['id','text']);identifier(t.id);if(ids.has(t.id)||typeof t.text!=='string'||bytes(t.text)>4096||invalidText(t.text))throw Error('Invalid Office target');ids.add(t.id);return Object.freeze({id:t.id,text:t.text});});
 // Reuse AH's shared input limits and read-only Sheets scope.
 buildOfficeLocalPrompt({kind:input.kind,task:input.kind==='sheets'?'summarize-range':'summarize-selection',texts:targets.map(t=>t.text)});
 return Object.freeze({kind:input.kind,documentId:input.documentId,revision:input.revision,selectionId:input.selectionId,targets:Object.freeze(targets)});
}
/** Call again immediately before acceptance inside the builder's atomic transaction. */
export function assertOfficeSelectionCurrent(snapshot:OfficeSelectionSnapshot,current:OfficeSelectionSnapshot):void {
 const a=captureOfficeSelection(snapshot),b=captureOfficeSelection(current);
 if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Office selection drift; capture and review again');
}
export function prepareOfficeReview(snapshot:OfficeSelectionSnapshot,task:OfficePromptInput['task']) {
 const captured=captureOfficeSelection(snapshot);
 return Object.freeze({snapshot:captured,task,...buildOfficeLocalPrompt({kind:captured.kind,task,texts:captured.targets.map(t=>t.text)})});
}
/** Output array is ordered text only, never model-selected destinations or executable edits.
 * This check is not a lease: builders must recheck on accept and own review/undo. */
export function createOfficeReviewProposal(snapshot:OfficeSelectionSnapshot,current:OfficeSelectionSnapshot,task:OfficePromptInput['task'],output:readonly string[]):OfficeReviewProposal {
 const prepared=prepareOfficeReview(snapshot,task);assertOfficeSelectionCurrent(prepared.snapshot,current);
 const rewrite=task==='rewrite-selection';
 if(!Array.isArray(output)||output.length!==(rewrite?prepared.snapshot.targets.length:1)||!output.every(t=>typeof t==='string'&&t.trim()&&bytes(t)<=4096&&!invalidText(t))||bytes(JSON.stringify(output))>16384)throw Error('Invalid Office draft output');
 const replacements=rewrite?prepared.snapshot.targets.map((t,i)=>Object.freeze({targetId:t.id,before:t.text,after:output[i]})):[];
 return Object.freeze({version:1,state:'awaiting-review',mode:rewrite?'rewrite':'summary',snapshot:prepared.snapshot,replacements:Object.freeze(replacements),summary:rewrite?null:output[0],applied:false,adapterRequired:true});
}
