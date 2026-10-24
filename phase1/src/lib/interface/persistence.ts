import {t} from '../i18n';
import {serializeInterfaceDocument} from './model';
import {interfaceSession} from './session';
interface Writable {write(data:string):Promise<void>;close():Promise<void>;abort?():Promise<void>;}
interface Picker {showSaveFilePicker?(options:unknown):Promise<{createWritable():Promise<Writable>}>;}
/** Only a completed host write clears dirty. Download fallback is a copy, not a confirmed save. */
export async function saveInterfaceSnapshot():Promise<boolean>{
 const doc=interfaceSession.get().document;if(!doc)return true;
 interfaceSession.notice('');const body=serializeInterfaceDocument(doc);const picker=window as unknown as Picker;
 if(!picker.showSaveFilePicker){const url=URL.createObjectURL(new Blob([body],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='interface-snapshot.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);interfaceSession.notice(t('interface.copy'));return false;}
 let stream:Writable|undefined;
 try{const file=await picker.showSaveFilePicker({suggestedName:'interface-snapshot.json',types:[{description:'Interface snapshot',accept:{'application/json':['.json']}}]});stream=await file.createWritable();await stream.write(body);await stream.close();interfaceSession.markSaved(doc.id,doc.revision);return !interfaceSession.get().dirty;}
 catch(error){try{await stream?.abort?.();}catch{/* Preserve source and recovery even if abort fails. */}if(error instanceof DOMException&&error.name==='AbortError')return false;throw error;}
}
