import type {DocumentsEngine} from './engine';
import {diffEdit,inverseOf,UndoStack,type TextEdit} from './edit';
import {getDocumentsState,patchDocuments} from './store';
/** The one open document: engine, undo history and the refresh after each edit. UI components only call these functions. */
let engine:DocumentsEngine|null=null;const undo=new UndoStack();let chain:Promise<unknown>=Promise.resolve();
export const getEngine=()=>engine;
const flags=()=>({canUndo:undo.canUndo,canRedo:undo.canRedo});
export function attachEngine(e:DocumentsEngine|null){engine=e;undo.clear();chain=Promise.resolve();patchDocuments({...flags(),editError:'',edited:false});}
async function refresh(d:{pages:number;pageSizes:readonly {width:number;height:number}[];text:string}){
 const blocks=await engine!.blocks();
 patchDocuments({blocks,pages:d.pages,pageSizes:d.pageSizes,words:d.text.split(/\s+/).filter(Boolean).length,rev:getDocumentsState().rev+1,...flags()});
}
export async function loadBlocks(d:{pages:number;pageSizes:readonly {width:number;height:number}[];text:string}){await refresh(d);}
async function apply(edit:TextEdit,record:'new'|'undo'|'redo'){
 const e=engine;if(!e)return;
 const block=getDocumentsState().blocks.find(b=>b.index===edit.block);
 if(!block||!block.editable||block.text===undefined)throw new Error('This paragraph cannot be edited as text.');
 const inv=inverseOf(block.text,edit);
 const d=await e.replace(edit);
 if(record==='new')undo.push(inv);else if(record==='undo')undo.pushRedo(inv);else undo.pushUndo(inv);
 patchDocuments({edited:true,editError:''});await refresh(d);
}
const run=(fn:()=>Promise<void>)=>{chain=chain.then(fn).catch(err=>patchDocuments({editError:err instanceof Error?err.message:String(err)}));return chain;};
/** Applies the difference between the paragraph's current text and `next` as one replacement. */
export const editParagraph=(index:number,next:string)=>run(async()=>{
 const block=getDocumentsState().blocks.find(b=>b.index===index);if(!block||!block.editable||block.text===undefined)throw new Error('This paragraph cannot be edited as text.');
 if(/[\r\n\uFFFC]/.test(next))throw new Error('Line breaks are not supported in this version. Edit one paragraph at a time.');
 const edit=diffEdit(index,block.text,next);if(!edit)return;await apply(edit,'new');
});
export const undoEdit=()=>run(async()=>{const x=undo.popUndo();if(x)await apply(x.inverse,'undo');});
export const redoEdit=()=>run(async()=>{const x=undo.popRedo();if(x)await apply(x.inverse,'redo');});
