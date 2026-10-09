import type {DocumentsEngine} from './engine';
/** Saves what the engine would write as a NEW file next to the original name. The opened file is never overwritten. */
export const copyName=(name:string)=>name.replace(/^.*[\\/]/,'').replace(/\.docx$/i,'')+' (Somnia copy).docx';
export async function saveCopy(engine:DocumentsEngine,name:string){
 const bytes=await engine.save();
 const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));
 const a=document.createElement('a');a.href=url;a.download=copyName(name);a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
