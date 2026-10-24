import type {DocBlock,UndoJournal} from './edit';
import {sha256Hex,type HistoryCheckpoint} from '../sessionSafety/snapshot';
/**
 * Documents recovery glue: what a session-safety snapshot holds and how history is validated on restore.
 * Pure helpers only. The wiring lives in lib/documents/session.ts and lib/sheets/session.ts; see docs/session-safety.md.
 */
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
