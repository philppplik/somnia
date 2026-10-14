import {interfaceSession} from './interface/session';
import {saveInterfaceSnapshot} from './interface/persistence';
/** Registers every studio's open work with the cross-studio registry (workDocs). Imported once by the app shell. */
import {registerWorkProvider,waitForSaver,type WorkProvider} from './workDocs';
import {getMedia,setActiveMedia,closeMediaForced,type MediaKind} from './media';
import {getState,dirtyFileNames,closeAllFileTabs,discardUnsavedFiles} from '../store/appStore';
import {executeCommand} from './commands';
import {dirtySheetNames} from './sheets/session';
import {dirtySlideNames,saveSlidesCopy,slidesIsDirty} from './slides/session';
import {dirtyPdfNames,exportPdfCopy,pdfIsDirty} from './pdfedit/session';
import {allPhotoSessions,dirtyPhoto,exportPhotoCopy} from './photos/studioSession';
import {rasterDirty} from '../store/rasterState';
import {getVectorSession,resetVectorSession,markVectorSaved} from './vectorstudio/session';
import {downloadSvg} from './vectorstudio/exportFiles';
import {getDesignState,clearDesign,markDesignSaved,downloadDesign} from './design/session';
import {serializeDesignDocument} from './design/model';
const mediaOf=(...kinds:MediaKind[])=>getMedia().items.filter(i=>kinds.includes(i.kind)).map(i=>i.name);
const closeMedia=(kinds:MediaKind[])=>{for(const n of mediaOf(...kinds))closeMediaForced(n);};
const none=():string[]=>[];
const viaSaver=(studio:string,name:string)=>async()=>{setActiveMedia(name);const f=await waitForSaver(studio,name);return f?await f():false;};
const rasterDirtyNames=()=>Object.entries(getState().rasterDoc).filter(([,d])=>rasterDirty(d)).map(([n])=>n);
const photoDirtyNames=()=>allPhotoSessions().filter(dirtyPhoto).map(s=>s.name);
export function installWorkProviders(){
 const offs:(()=>void)[]=[];
 const reg=(p:WorkProvider)=>offs.push(registerWorkProvider(p));
 reg({studio:'code',dirty:dirtyFileNames,openCount:()=>getState().openFiles.length,
  async save(){if(!dirtyFileNames().length)return true;setActiveMedia(null);await executeCommand('project.save');
   for(let i=0;i<40&&dirtyFileNames().length;i++)await new Promise(r=>setTimeout(r,50));return !dirtyFileNames().length;},
  discard:()=>discardUnsavedFiles(),closeAll:()=>closeAllFileTabs()});
 reg({studio:'sheets',dirty:dirtySheetNames,openCount:()=>mediaOf('xlsx').length,
  save:async name=>{const ok=await viaSaver('sheets',name)();return ok&&!dirtySheetNames().includes(name);},discard:none,closeAll:()=>closeMedia(['xlsx'])});
 reg({studio:'slides',dirty:dirtySlideNames,openCount:()=>mediaOf('pptx').length,
  async save(name){setActiveMedia(name);await saveSlidesCopy();return !slidesIsDirty(name);},discard:none,closeAll:()=>closeMedia(['pptx'])});
 reg({studio:'pdf',dirty:dirtyPdfNames,openCount:()=>mediaOf('pdf').length,
  async save(name){await exportPdfCopy(name);return !pdfIsDirty(name);},discard:none,closeAll:()=>closeMedia(['pdf'])});
 reg({studio:'photos',dirty:()=>[...new Set([...rasterDirtyNames(),...photoDirtyNames()])],openCount:()=>mediaOf('image','psd','raster-preview').length,
  async save(name){
   if(rasterDirtyNames().includes(name)){const ok=await viaSaver('image',name)();if(!ok)return false;}
   if(photoDirtyNames().includes(name)){const r=await exportPhotoCopy(name,/\.jpe?g$/i.test(name)?'jpeg':'png');if(r!=='saved')return false;}
   return !rasterDirtyNames().includes(name)&&!photoDirtyNames().includes(name);},
  discard:none,closeAll:()=>closeMedia(['image','psd','raster-preview'])});
 reg({studio:'media',dirty:()=>[],openCount:()=>mediaOf('docx','audio','video','video-project').length,save:async()=>true,discard:none,closeAll:()=>closeMedia(['docx','audio','video','video-project'])});
 reg({studio:'vector',dirty:()=>{const v=getVectorSession();return v.open&&v.dirty?[v.name]:[];},openCount:()=>getVectorSession().open?1:0,
  async save(name){downloadSvg(name);markVectorSaved();return true;},discard:none,closeAll:()=>{if(getVectorSession().open)resetVectorSession();}});
 reg({studio:'design',dirty:()=>{const d=getDesignState();return d.document&&d.dirty?[d.document.name]:[];},openCount:()=>getDesignState().document?1:0,
  async save(){const d=getDesignState().document;if(!d)return true;downloadDesign(`${d.name}.somdesign`,serializeDesignDocument(d),'application/json');markDesignSaved();return true;},
  discard:none,closeAll:()=>clearDesign()});
 reg({studio:'interface',dirty:()=>{const s=interfaceSession.get();return s.document&&s.dirty?[s.document.name]:[];},openCount:()=>interfaceSession.get().document?1:0,save:saveInterfaceSnapshot,discard:none,closeAll:()=>interfaceSession.clear()});
 return()=>offs.forEach(f=>f());
}
