import {getDocumentsState,patchDocuments} from './store';
import {syncGeometry} from './session';
export {scrollToPage} from './scrollPage';
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
