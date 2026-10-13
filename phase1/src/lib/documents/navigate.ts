import {getDocumentsState,patchDocuments} from './store';
import {syncGeometry} from './session';
/** Brings a page (0-based) into view in the Documents canvas. False when the page is not mounted (no document open). */
export function scrollToPage(index:number):boolean{
 if(typeof document==='undefined')return false;
 const el=document.querySelector<HTMLElement>(`[data-testid="documents-page"][data-page="${index+1}"]`);
 if(!el)return false;el.scrollIntoView({block:'start',behavior:'smooth'});return true;
}
/** Puts the caret at the start of a paragraph and scrolls to it. False for tables and object blocks (no text position). */
export async function goToBlock(index:number):Promise<boolean>{
 const b=getDocumentsState().blocks.find(x=>x.index===index);
 if(!b||!b.editable)return false;
 patchDocuments({caret:{block:index,anchor:0,head:0},caretLocked:false,editError:''});
 await syncGeometry();
 const page=getDocumentsState().caretBox?.page;
 return page===undefined?false:scrollToPage(page);
}
/** Page index (0-based) holding the caret, or null. */
export const caretPage=()=>getDocumentsState().caretBox?.page??null;
