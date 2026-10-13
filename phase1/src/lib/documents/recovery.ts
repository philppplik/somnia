import type {DocBlock,UndoJournal} from './edit';
import {registerMediaCloseCleanup,registerMediaCloseGuard} from '../media';
import {installBeforeUnload} from '../closeFlow';
import {getDocumentsState} from './store';
import {discardSession} from '../sessionSafety/flush';
import {sha256Hex,type HistoryCheckpoint} from '../sessionSafety/snapshot';
/** Documents recovery glue: what a snapshot holds and how history is validated on restore. */
export const documentsSessionId=(name:string)=>`documents:${name}`;
/** Hash of all editable paragraph texts. Undo hunks are byte offsets into these, so history is only reused when the restored document has identical text. */
export async function blocksDigest(blocks:readonly DocBlock[]):Promise<string>{
 return sha256Hex(new TextEncoder().encode(JSON.stringify(blocks.map(b=>[b.index,b.kind,b.editable,b.text??null]))));
}
export interface DocumentsHistoryData{journal:UndoJournal;digest:string}
export const asHistory=(journal:UndoJournal,digest:string):HistoryCheckpoint=>({kind:'journal',data:{journal,digest} satisfies DocumentsHistoryData,truncated:journal.truncated});
/** Returns the journal when it is valid for the restored blocks, else null (history reset, text kept). */
export async function validHistory(h:HistoryCheckpoint,blocks:readonly DocBlock[]):Promise<{journal:UndoJournal;truncated:boolean}|null>{
 if(h.kind!=='journal')return null;const d=h.data as Partial<DocumentsHistoryData>|null;if(!d||!d.journal||typeof d.digest!=='string')return null;
 if(await blocksDigest(blocks)!==d.digest)return null;return{journal:d.journal,truncated:h.truncated};
}

/** Closing a document is the user's explicit discard of its unsaved edits: drop the recovery snapshots with it. */
registerMediaCloseCleanup(name=>{void discardSession(documentsSessionId(name));});
/** Unsaved Documents edits: ask before the close discards them (Sheets and Slides already do), and warn on window unload. */
export const documentsIsDirty=(name?:string)=>{const s=getDocumentsState();return s.edited&&(name===undefined||s.name===name);};
if(typeof window!=='undefined'){installBeforeUnload(()=>documentsIsDirty());registerMediaCloseGuard(name=>!documentsIsDirty(name)||window.confirm(`Discard unsaved document edits to ${name}?`));}
