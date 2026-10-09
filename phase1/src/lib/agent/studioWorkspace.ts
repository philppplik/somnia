/** One live source catalog shared by the sidebar and the reviewed transaction bridge.
 * The catalog serializes editor state only. It never fetches media or exposes URLs/bytes.
 */
import {getMedia,findMedia} from '../media';
import {getState} from '../../store/appStore';
import {getDocumentsState} from '../documents/store';
import {getSheetsSelection} from '../sheets/sheetsStore';
import {getVideoSession} from '../video/session';
import {photoFiles,getPhoto} from './photoWorkspace';
import {photoDevelopFiles,getPhotoDevelop} from './photoDevelopWorkspace';
import {soundFiles,soundRevisionFor} from './soundWorkspace';
import {deckFiles,getDeck} from './deckWorkspace';
import {codeAdapter} from './codeStudio';
import {photoAdapter,photoDevelopAdapter} from './photoStudio';
import {soundAdapter} from './soundStudio';
import {deckAdapter} from './deckStudio';
import type {DocumentBinding,StudioKind} from './documentCore';
import {studioFor} from './documentCore';
export function studioWorkspace(){
 const state=getState(),files:Record<string,string>={...state.files},bindings:Record<string,DocumentBinding>={};
 for(const path of Object.keys(files))bindings[path]={kind:studioFor(path),adapter:studioFor(path)==='code'?codeAdapter.id:null,identity:`source:${path}`,revision:state.revision};
 const add=(items:Record<string,string>,kind:StudioKind,adapter:string,revision:(path:string)=>number|undefined)=>{
  for(const [path,text] of Object.entries(items)){
   // A media/text collision is ambiguous, not permission to overwrite the text catalog.
   if(Object.hasOwn(state.files,path))continue;
   files[path]=text;bindings[path]={kind,adapter,identity:findMedia(path)?.url??`media:${path}`,revision:revision(path)};
  }
 };
 add(photoDevelopFiles(),'photo',photoDevelopAdapter.id,path=>getPhotoDevelop(path)?.session.revision);
 add(photoFiles(),'photo',photoAdapter.id,path=>getPhoto(path)?.state.past.length);
 add(soundFiles(),'sound',soundAdapter.id,path=>soundRevisionFor(path));
 add(deckFiles(),'slides',deckAdapter.id,path=>getDeck(path)?.revision);
 const doc=getDocumentsState();
 if(doc.status==='ready'&&doc.name&&findMedia(doc.name)?.kind==='docx'&&!Object.hasOwn(state.files,doc.name)){
  files[doc.name]=JSON.stringify({pages:doc.pages,blocks:doc.blocks.map(b=>({index:b.index,kind:b.kind,text:b.text??'',editable:b.editable}))});
  bindings[doc.name]={kind:'documents',adapter:null,identity:findMedia(doc.name)!.url,revision:doc.rev};
 }
 const cell=getSheetsSelection();
 if(cell&&findMedia(cell.file)?.kind==='xlsx'&&!Object.hasOwn(state.files,cell.file)){
  files[cell.file]=JSON.stringify({sheet:cell.sheet,sheetName:cell.sheetName,address:cell.address,kind:cell.kind,text:cell.text,formula:cell.formula});
  bindings[cell.file]={kind:'sheets',adapter:null,identity:findMedia(cell.file)!.url};
 }
 for(const media of getMedia().items){
  const v=media.kind==='video'?getVideoSession(media.name):null;
  if(!v?.probe||v.status==='loading'||Object.hasOwn(state.files,media.name))continue;
  files[media.name]=JSON.stringify({tracks:v.probe,clips:v.clips.map(c=>({id:c.id,source:c.source,in_s:c.in_s,out_s:c.out_s,gain:c.gain,muted:c.muted})),selectedClipId:v.selectedClipId,format:v.format});
  bindings[media.name]={kind:'video',adapter:null,identity:media.url};
 }
 return {files,bindings};
}
