import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {validateDocument,type AnimationDocument} from './model';
import {defaultView,type ViewState} from './recovery';
import {animationSession,type AnimationSession} from './session';
import {downloadBlob,exportSlug} from './exportFrames';
/** Experimental local snapshot entries only. No container manifest, extension association or smart-open claim. */
export const SNAPSHOT_LIMIT=8_000_000;
export function serializeAnimationSnapshot(doc:AnimationDocument,view:ViewState):Uint8Array{
 const errors=validateDocument(doc);if(errors.length)throw Error(errors.join('; '));
 const body=JSON.stringify(doc);if(new TextEncoder().encode(body).length>SNAPSHOT_LIMIT)throw Error('Animation snapshot exceeds 8 MB.');
 return zipSync({'animation/document.json':strToU8(body),'animation/view.json':strToU8(JSON.stringify(view))},{level:0});
}
export function parseAnimationSnapshot(bytes:Uint8Array):{doc:AnimationDocument;view:ViewState}{
 if(bytes.byteLength>SNAPSHOT_LIMIT)throw Error('Animation snapshot exceeds 8 MB.');let total=0;
 const files=unzipSync(bytes,{filter:file=>{total+=file.originalSize;if(file.originalSize>SNAPSHOT_LIMIT||total>SNAPSHOT_LIMIT||!['animation/document.json','animation/view.json'].includes(file.name))throw Error('Unsupported entry or expanded snapshot size.');return true;}});
 if(!files['animation/document.json'])throw Error('No animation document entry.');
 const doc=JSON.parse(strFromU8(files['animation/document.json'])) as AnimationDocument,errors=validateDocument(doc);if(errors.length)throw Error(errors.join('; '));
 const raw=files['animation/view.json']?JSON.parse(strFromU8(files['animation/view.json'])):{};
 const view=defaultView();if(raw&&typeof raw==='object'){if(Number.isFinite(raw.playhead))view.playhead=Math.max(0,Math.min(doc.compositions.find(c=>c.id===doc.activeComp)!.duration,raw.playhead));if(typeof raw.selectedLayer==='string'&&doc.compositions.some(c=>c.layers.some(l=>l.id===raw.selectedLayer)))view.selectedLayer=raw.selectedLayer;view.graph=raw.graph===true;view.graphMode=raw.graphMode==='speed'?'speed':'value';view.graphChannel=raw.graphChannel===1?1:0;view.loop=raw.loop!==false;if(Number.isFinite(raw.zoom)&&raw.zoom>=0.1&&raw.zoom<=20)view.zoom=raw.zoom;if(Number.isFinite(raw.scroll)&&raw.scroll>=0)view.scroll=raw.scroll;if(Array.isArray(raw.openProps))view.openProps=raw.openProps.filter((p:unknown)=>typeof p==='string'&&['anchor','position','scale','rotation','opacity'].includes(p)).slice(0,5);}
 return {doc,view};
}
interface Writable{write(data:Uint8Array):Promise<void>;close():Promise<void>;abort?():Promise<void>}
interface Picker{showSaveFilePicker?(options:unknown):Promise<{createWritable():Promise<Writable>}>}
/** File System Access close commits a local write. Downloads are unconfirmed copies and never clear dirty. */
export async function saveAnimationSnapshot(session:AnimationSession=animationSession(),picker:Picker=window as unknown as Picker):Promise<boolean>{
 const doc=session.document;if(!doc)throw Error('Open an animation first.');const bytes=serializeAnimationSnapshot(doc,session.getState().view);
 if(!picker.showSaveFilePicker){downloadBlob(new Blob([bytes as BlobPart],{type:'application/zip'}),`${exportSlug(doc.name)}.somnia`);return false;}
 let stream:Writable|undefined;
 try{const handle=await picker.showSaveFilePicker({suggestedName:`${exportSlug(doc.name)}.somnia`,types:[{description:'Animation local snapshot (experimental)',accept:{'application/zip':['.somnia']}}]});stream=await handle.createWritable();await stream.write(bytes);await stream.close();return session.document===doc&&session.markSaved(doc.id,doc.revision);}
 catch(e){try{await stream?.abort?.();}catch{/* recovery remains intact */}if(e instanceof DOMException&&e.name==='AbortError')return false;throw e;}
}
